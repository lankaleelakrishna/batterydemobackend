import { Harness, makeAdminSession, makeBrand, makeCategory, makeProduct, registerCustomer, resetDatabase, startHarness } from './helpers';

describe('Reviews, testimonials and newsletter (e2e)', () => {
  let h: Harness;
  let slug: string;
  let productId: number;

  beforeAll(async () => {
    h = await startHarness();
  });

  afterAll(async () => {
    await h.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.ds);
    const brand = await makeBrand(h.ds, 'Northwatt');
    const cat = await makeCategory(h.ds, 'batteries');
    const p = await makeProduct(h.ds, { slug: 'tt-150', brandId: brand.id, categoryId: cat.id });
    productId = p.id;
    slug = p.slug;
  });

  describe('product reviews', () => {
    it('requires sign-in to review', async () => {
      await h.http().post(`/products/${slug}/reviews`).send({ rating: 5, body: 'Works well in our home.' }).expect(401);
    });

    it('holds a new review as pending, so it is not public until an admin approves it', async () => {
      const { token } = await registerCustomer(h, 'reviewer@example.com', 'Ananya Iyer');
      const created = await h
        .http()
        .post(`/products/${slug}/reviews`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 5, title: 'Solid', body: 'Lasted through a long outage.' })
        .expect(201);
      expect(created.body.status).toBe('pending');
      const before = await h.http().get(`/products/${slug}/reviews`).expect(200);
      expect(before.body.data).toEqual([]);
      expect(before.body.summary).toEqual({ average: 0, count: 0 });
    });

    it('allows one review per customer per product', async () => {
      const { token } = await registerCustomer(h, 'once@example.com');
      await h.http().post(`/products/${slug}/reviews`).set('Authorization', `Bearer ${token}`).send({ rating: 4, body: 'First impressions good.' }).expect(201);
      const dup = await h.http().post(`/products/${slug}/reviews`).set('Authorization', `Bearer ${token}`).send({ rating: 2, body: 'Second thoughts here.' }).expect(409);
      expect(dup.body.code).toBe('REVIEW_EXISTS');
    });

    it('validates the rating range', async () => {
      const { token } = await registerCustomer(h, 'range@example.com');
      await h.http().post(`/products/${slug}/reviews`).set('Authorization', `Bearer ${token}`).send({ rating: 6, body: 'Too high a rating.' }).expect(400);
      await h.http().post(`/products/${slug}/reviews`).set('Authorization', `Bearer ${token}`).send({ rating: 0, body: 'Too low a rating.' }).expect(400);
    });

    it('shows approved reviews with the first name only, and updates the product rating', async () => {
      const { token } = await registerCustomer(h, 'public@example.com', 'Ravi Kumar Sharma');
      const created = await h
        .http()
        .post(`/products/${slug}/reviews`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 4, body: 'Good value for the warranty.' })
        .expect(201);
      const admin = await makeAdminSession(h);
      await h.http().patch(`/admin/reviews/${created.body.id}`).set('Authorization', `Bearer ${admin}`).send({ status: 'approved' }).expect(200);

      const list = await h.http().get(`/products/${slug}/reviews`).expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0].authorName).toBe('Ravi');
      expect(list.body.data[0]).not.toHaveProperty('email');
      expect(list.body.summary).toEqual({ average: 4, count: 1 });

      const product = await h.http().get(`/products/${slug}`).expect(200);
      expect(product.body.rating).toEqual({ average: 4, count: 1 });
    });

    it('lets a customer delete only their own review', async () => {
      const a = await registerCustomer(h, 'a-review@example.com');
      const b = await registerCustomer(h, 'b-review@example.com');
      const created = await h
        .http()
        .post(`/products/${slug}/reviews`)
        .set('Authorization', `Bearer ${a.token}`)
        .send({ rating: 3, body: 'Average, nothing special.' })
        .expect(201);
      await h.http().delete(`/reviews/${created.body.id}`).set('Authorization', `Bearer ${b.token}`).expect(404);
      await h.http().delete(`/reviews/${created.body.id}`).set('Authorization', `Bearer ${a.token}`).expect(200);
    });

    it('does not accept reviews for unknown products', async () => {
      const { token } = await registerCustomer(h, 'ghost@example.com');
      await h.http().post('/products/missing-slug/reviews').set('Authorization', `Bearer ${token}`).send({ rating: 5, body: 'Reviewing nothing here.' }).expect(404);
      expect(productId).toBeGreaterThan(0);
    });
  });

  describe('testimonials', () => {
    it('shows only published testimonials, in order', async () => {
      const admin = await makeAdminSession(h);
      const auth = { Authorization: `Bearer ${admin}` };
      await h
        .http()
        .post('/admin/testimonials')
        .set(auth)
        .send({ author: 'Published A', location: 'Pune', rating: 5, body: 'A published testimonial text.', productId, isPublished: true, sortOrder: 2 })
        .expect(201);
      await h.http().post('/admin/testimonials').set(auth).send({ author: 'Hidden B', rating: 3, body: 'A draft testimonial text.', isPublished: false, sortOrder: 1 }).expect(201);
      await h
        .http()
        .post('/admin/testimonials')
        .set(auth)
        .send({ author: 'Published C', rating: 4, body: 'Another published testimonial.', isPublished: true, sortOrder: 1 })
        .expect(201);

      const res = await h.http().get('/testimonials').expect(200);
      expect(res.body.map((t: { author: string }) => t.author)).toEqual(['Published C', 'Published A']);
      expect(res.body[1].productName).toBe('tt-150');
      expect(res.body[0]).not.toHaveProperty('productName');
    });

    it('is managed only by admins', async () => {
      const { token } = await registerCustomer(h, 'notadmin@example.com');
      await h.http().post('/admin/testimonials').set('Authorization', `Bearer ${token}`).send({ author: 'X', rating: 5, body: 'Should not be allowed.' }).expect(403);
    });
  });

  describe('newsletter', () => {
    it('subscribes an address once, however often it is submitted', async () => {
      await h.http().post('/newsletter/subscribe').send({ email: 'Fan@Example.com' }).expect(201);
      await h.http().post('/newsletter/subscribe').send({ email: 'fan@example.com' }).expect(201);
      const admin = await makeAdminSession(h);
      const list = await h.http().get('/admin/newsletter-subscribers').set('Authorization', `Bearer ${admin}`).expect(200);
      expect(list.body.meta.total).toBe(1);
      expect(list.body.data[0].email).toBe('fan@example.com');
    });

    it('rejects an invalid address', async () => {
      const res = await h.http().post('/newsletter/subscribe').send({ email: 'not-an-email' }).expect(400);
      expect(res.body.details.fields.join(' ')).toMatch(/valid email|name@example/);
    });
  });
});
