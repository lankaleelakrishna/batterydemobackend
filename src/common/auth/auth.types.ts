export type UserRole = 'customer' | 'admin';

/** Claims placed inside the JWT. `tv` is the user's token version, bumped on logout to revoke tokens. */
export interface JwtClaims {
  sub: string;
  role: UserRole;
  tv: number;
}

/** The authenticated user attached to the request after the token is verified against the database. */
export interface AuthUser {
  id: number;
  role: UserRole;
  email: string;
  fullName: string;
}
