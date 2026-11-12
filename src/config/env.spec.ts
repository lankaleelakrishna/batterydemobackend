import { EnvValidationError, loadAppEnv, loadDatabaseEnv, parseDatabaseUrl } from './env';

const GOOD_SECRET = 'a'.repeat(40);

function baseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: 'development',
    PG_USER: 'volten',
    PG_PASSWORD: 'pw',
    PG_DATABASE: 'volten_dev',
    JWT_SECRET: GOOD_SECRET,
    ...overrides,
  };
}

describe('loadAppEnv', () => {
  it('loads a valid development configuration', () => {
    const env = loadAppEnv(baseEnv());
    expect(env.nodeEnv).toBe('development');
    expect(env.jwt.expiresIn).toBe('12h');
    expect(env.database.database).toBe('volten_dev');
  });

  it('refuses the placeholder JWT secret and short secrets', () => {
    expect(() => loadAppEnv(baseEnv({ JWT_SECRET: 'change-me-in-production' }))).toThrow(EnvValidationError);
    expect(() => loadAppEnv(baseEnv({ JWT_SECRET: 'short' }))).toThrow(/at least 32/);
  });

  it('requires CORS origins in production and refuses a wildcard', () => {
    expect(() => loadAppEnv(baseEnv({ NODE_ENV: 'production' }))).toThrow(/CORS_ORIGINS is required/);
    expect(() => loadAppEnv(baseEnv({ CORS_ORIGINS: '*' }))).toThrow(/must not contain/);
  });

  it('refuses demo seeding in production', () => {
    expect(() =>
      loadAppEnv(
        baseEnv({
          NODE_ENV: 'production',
          CORS_ORIGINS: 'https://shop.example',
          SEED_DEMO_DATA: 'true',
          DEMO_ADMIN_PASSWORD: 'x',
          DEMO_CUSTOMER_PASSWORD: 'y',
        }),
      ),
    ).toThrow(/must not be true in production/);
  });

  it('leaves every business rule unset by default, so checkout refuses to run', () => {
    const env = loadAppEnv(baseEnv());
    expect(env.store).toEqual({
      shippingFeePaise: null,
      gstRateBasisPoints: null,
      gstMode: null,
      minOrderPaise: null,
      codEnabled: false,
      serviceablePincodes: null,
    });
  });

  it('reads configured business rules', () => {
    const env = loadAppEnv(
      baseEnv({
        SHIPPING_FEE_PAISE: '4900',
        GST_RATE_BASIS_POINTS: '1800',
        GST_MODE: 'exclusive',
        COD_ENABLED: 'true',
        SERVICEABLE_PINCODES: '500001, 560001',
      }),
    );
    expect(env.store.shippingFeePaise).toBe(4900);
    expect(env.store.gstMode).toBe('exclusive');
    expect(env.store.codEnabled).toBe(true);
    expect(env.store.serviceablePincodes).toEqual(['500001', '560001']);
  });

  it('rejects invalid values with every problem listed', () => {
    try {
      loadAppEnv(baseEnv({ GST_MODE: 'maybe', COD_ENABLED: 'yes', SHIPPING_FEE_PAISE: 'abc' }));
      throw new Error('expected validation to fail');
    } catch (err) {
      const problems = (err as EnvValidationError).problems;
      expect(problems).toEqual(
        expect.arrayContaining(['GST_MODE must be "inclusive" or "exclusive"', 'COD_ENABLED must be "true" or "false"', 'SHIPPING_FEE_PAISE must be an integer']),
      );
    }
  });
});

describe('loadDatabaseEnv', () => {
  it('requires the PostgreSQL user, password and database', () => {
    expect(() => loadDatabaseEnv({})).toThrow(/PG_USER is required/);
  });

  it('parses a Supabase pooler URL, decodes the password and enables TLS', () => {
    const db = loadDatabaseEnv({
      DATABASE_URL: 'postgresql://postgres.abc:Dp%40battery2026@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true',
    });
    expect(db).toEqual({
      host: 'aws-0-ap-northeast-2.pooler.supabase.com',
      port: 6543,
      user: 'postgres.abc',
      password: 'Dp@battery2026',
      database: 'postgres',
      ssl: true,
    });
  });

  it('uses DIRECT_URL for migrations, and DATABASE_URL at runtime', () => {
    const env = {
      DATABASE_URL: 'postgresql://u:p@pooler.example:6543/postgres',
      DIRECT_URL: 'postgresql://u:p@direct.example:5432/postgres',
    };
    expect(loadDatabaseEnv(env, 'runtime').host).toBe('pooler.example');
    expect(loadDatabaseEnv(env, 'migration')).toMatchObject({ host: 'direct.example', port: 5432 });
  });

  it('respects an explicit sslmode=disable', () => {
    expect(parseDatabaseUrl('postgresql://u:p@localhost:5432/volten_dev?sslmode=disable').ssl).toBe(false);
  });

  it('rejects a DATABASE_URL that is not PostgreSQL', () => {
    expect(() => parseDatabaseUrl('mysql://u:p@h/db')).toThrow(/must start with postgresql/);
    expect(() => parseDatabaseUrl('not a url')).toThrow(/not a valid URL/);
  });
});
