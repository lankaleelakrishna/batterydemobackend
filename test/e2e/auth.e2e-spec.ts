import { JwtService } from '@nestjs/jwt';
import { Harness, PASSWORD, addAddress, makeAdminSession, makeUser, registerCustomer, resetDatabase, signIn, startHarness } from './helpers';

describe('Authentication, authorisation and profile (e2e)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  });

  afterAll(async () => {
    await h.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.ds);
  });

  it('registers a customer and returns a token, without any password data', async () => {
    const res = await h
      .http()
      .post('/auth/register')
      .send({ fullName: '  Asha Rao ', email: 'ASHA@Example.com', password: PASSWORD })
      .expect(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toEqual({ id: expect.any(Number), email: 'asha@example.com', fullName: 'Asha Rao', phone: null, role: 'customer' });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
  });

  it('rejects weak and malformed registrations with field messages', async () => {
    const res = await h.http().post('/auth/register').send({ fullName: 'A', email: 'not-an-email', password: 'short' }).expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.details.fields.join(' ')).toMatch(/Password must be at least 8/);
  });

  it('refuses a second account with the same email', async () => {
    await registerCustomer(h, 'dup@example.com');
    const res = await h.http().post('/auth/register').send({ fullName: 'Other', email: 'dup@example.com', password: PASSWORD }).expect(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    await registerCustomer(h, 'known@example.com');
    const wrongPassword = await h.http().post('/auth/login').send({ email: 'known@example.com', password: 'not-the-password' }).expect(422);
    const unknownEmail = await h.http().post('/auth/login').send({ email: 'nobody@example.com', password: 'not-the-password' }).expect(422);
    expect(wrongPassword.body.code).toBe('INVALID_CREDENTIALS');
    expect(unknownEmail.body).toEqual({ ...wrongPassword.body, timestamp: unknownEmail.body.timestamp, path: '/auth/login' });
  });

  it('returns the current user for a valid token and rejects requests without one', async () => {
    const { token } = await registerCustomer(h, 'me@example.com', 'Me Person');
    const me = await h.http().get('/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body.email).toBe('me@example.com');
    const anon = await h.http().get('/auth/me').expect(401);
    expect(anon.body.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a token signed with the wrong secret', async () => {
    const forged = h.app.get(JwtService).sign(
      { sub: '1', role: 'admin', tv: 0 },
      { secret: 'not-the-real-secret-that-is-long-enough', issuer: 'volten-api', audience: 'volten-storefront' },
    );
    await h.http().get('/auth/me').set('Authorization', `Bearer ${forged}`).expect(401);
  });

  it('revokes every token on logout', async () => {
    const { token } = await registerCustomer(h, 'logout@example.com');
    await h.http().post('/auth/logout').set('Authorization', `Bearer ${token}`).expect(200);
    await h.http().get('/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
    // Signing in again issues a fresh token that works.
    const fresh = await signIn(h, 'logout@example.com');
    await h.http().get('/auth/me').set('Authorization', `Bearer ${fresh}`).expect(200);
  });

  it('keeps customers out of admin routes and lets admins in', async () => {
    const { token } = await registerCustomer(h, 'shopper@example.com');
    const denied = await h.http().get('/admin/dashboard').set('Authorization', `Bearer ${token}`).expect(403);
    expect(denied.body.code).toBe('FORBIDDEN');
    const adminToken = await makeAdminSession(h);
    const allowed = await h.http().get('/admin/dashboard').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(allowed.body).toHaveProperty('revenue');
  });

  it('refuses sign-in for a deactivated account', async () => {
    await makeUser(h.ds, { email: 'inactive@example.com', fullName: 'Inactive', isActive: false });
    await h.http().post('/auth/login').send({ email: 'inactive@example.com', password: PASSWORD }).expect(422);
  });

  it('updates the profile and changes the password, which signs out existing sessions', async () => {
    const { token } = await registerCustomer(h, 'profile@example.com');
    const updated = await h.http().put('/me').set('Authorization', `Bearer ${token}`).send({ fullName: 'New Name', phone: '+91 91234 56789' }).expect(200);
    expect(updated.body.fullName).toBe('New Name');

    await h.http().put('/me/password').set('Authorization', `Bearer ${token}`).send({ currentPassword: 'wrong-one', newPassword: 'another-long-password' }).expect(422);
    await h.http().put('/me/password').set('Authorization', `Bearer ${token}`).send({ currentPassword: PASSWORD, newPassword: 'another-long-password' }).expect(200);
    await h.http().get('/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('manages addresses, keeps one default, and hides other customers\' addresses', async () => {
    const a = await registerCustomer(h, 'owner@example.com');
    const b = await registerCustomer(h, 'other@example.com');
    const first = await addAddress(h, a.token, '500001');
    const second = await h
      .http()
      .post('/me/addresses')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ fullName: 'Owner', phone: '9876543210', line1: '5 Main Road', city: 'Pune', state: 'Maharashtra', pincode: '411001', isDefault: true })
      .expect(201);
    const list = await h.http().get('/me/addresses').set('Authorization', `Bearer ${a.token}`).expect(200);
    expect(list.body.data.filter((x: { isDefault: boolean }) => x.isDefault).map((x: { id: number }) => x.id)).toEqual([second.body.id]);
    expect(list.body.data.map((x: { id: number }) => x.id)).toContain(first);

    await h.http().put(`/me/addresses/${first}`).set('Authorization', `Bearer ${b.token}`).send({ fullName: 'Intruder', phone: '+91 98765 43210', line1: 'Hacked line', city: 'Hyderabad', state: 'Telangana', pincode: '500001' }).expect(404);
    await h.http().delete(`/me/addresses/${first}`).set('Authorization', `Bearer ${b.token}`).expect(404);
  });

  it('rejects an invalid pincode', async () => {
    const { token } = await registerCustomer(h, 'pin@example.com');
    const res = await h
      .http()
      .post('/me/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Pin', phone: '9876543210', line1: 'Some road', city: 'City', state: 'State', pincode: '0123' })
      .expect(400);
    expect(res.body.details.fields.join(' ')).toMatch(/6-digit pincode/);
  });

  it('rejects unknown fields in request bodies', async () => {
    const res = await h.http().post('/auth/register').send({ fullName: 'Extra', email: 'extra@example.com', password: PASSWORD, role: 'admin' }).expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });
});
