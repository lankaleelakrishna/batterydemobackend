import { JwtClaims } from './auth.types';

describe('JWT claims shape', () => {
  it('carries the token version used for revocation', () => {
    const claims: JwtClaims = { sub: '42', role: 'customer', tv: 3 };
    expect(claims.tv).toBe(3);
  });
});
