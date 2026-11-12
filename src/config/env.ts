/**
 * Environment configuration for the VOLTEX API.
 *
 * Every value is read from process.env and validated once at startup. Business
 * rules (shipping, GST, minimum order, cash on delivery, serviceable pincodes)
 * are deliberately NOT given defaults: when unset they are null and checkout
 * refuses to place orders until they are configured.
 */

export type NodeEnv = 'development' | 'test' | 'production';
export type GstMode = 'inclusive' | 'exclusive';

export interface DatabaseEnv {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
  /** Optional PEM file with the CA that signed the server certificate. Verification stays on. */
  sslCaFile?: string;
}

export interface StoreEnv {
  /** Flat shipping fee in paise. null = not configured. */
  shippingFeePaise: number | null;
  /** GST rate in basis points (1800 = 18%). null = not configured. */
  gstRateBasisPoints: number | null;
  /** Whether listed prices already include GST. null = not configured. */
  gstMode: GstMode | null;
  /** Minimum order subtotal in paise. null = no minimum enforced. */
  minOrderPaise: number | null;
  /** Cash on delivery is offered only when explicitly enabled. */
  codEnabled: boolean;
  /** Pincodes we deliver to. null = not configured, so checkout is refused. */
  serviceablePincodes: string[] | null;
}

export interface AppEnv {
  nodeEnv: NodeEnv;
  port: number;
  publicUrl: string;
  corsOrigins: string[];
  database: DatabaseEnv;
  jwt: { secret: string; expiresIn: string; issuer: string; audience: string };
  rateLimit: { ttlMs: number; limit: number };
  uploadDir: string;
  logRequests: boolean;
  seedDemoData: boolean;
  demoPasswords: { admin: string; customer: string } | null;
  store: StoreEnv;
}

export const INSECURE_JWT_SECRETS = ['change-me-in-production', 'changeme', 'secret'];
const MIN_JWT_SECRET_LENGTH = 32;

class EnvValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'EnvValidationError';
  }
}

type Env = Record<string, string | undefined>;

function read(env: Env, key: string): string | undefined {
  const value = env[key];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function readInt(env: Env, key: string, problems: string[], fallback?: number): number | null {
  const raw = read(env, key);
  if (raw === undefined) {
    if (fallback !== undefined) return fallback;
    return null;
  }
  if (!/^-?\d+$/.test(raw)) {
    problems.push(`${key} must be an integer`);
    return null;
  }
  return Number(raw);
}

function readBool(env: Env, key: string, problems: string[], fallback: boolean): boolean {
  const raw = read(env, key);
  if (raw === undefined) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  problems.push(`${key} must be "true" or "false"`);
  return fallback;
}

function readList(env: Env, key: string): string[] | null {
  const raw = read(env, key);
  if (raw === undefined) return null;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parses a postgres:// URL. Passwords are URL-decoded (for example %40 is "@").
 * TLS is on when sslmode is set to anything but "disable", or when the host is Supabase,
 * which requires encrypted connections.
 */
export function parseDatabaseUrl(raw: string): DatabaseEnv {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new EnvValidationError(['DATABASE_URL is not a valid URL']);
  }
  if (u.protocol !== 'postgresql:' && u.protocol !== 'postgres:') {
    throw new EnvValidationError(['DATABASE_URL must start with postgresql://']);
  }
  const database = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (!u.username || !database) throw new EnvValidationError(['DATABASE_URL must include a user and a database name']);
  const sslmode = u.searchParams.get('sslmode');
  const ssl = sslmode !== null ? sslmode !== 'disable' : /\.supabase\.(co|com)$/.test(u.hostname);
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database,
    ssl,
  };
}

/**
 * Database settings. Priority:
 * - runtime: DATABASE_URL, then PG_* variables.
 * - migrations (which="migration"): DIRECT_URL (session pooler), then DATABASE_URL, then PG_*.
 * The migration CLI does not need JWT or CORS settings.
 */
export function loadDatabaseEnv(env: Env = process.env, which: 'runtime' | 'migration' = 'runtime'): DatabaseEnv {
  const direct = which === 'migration' ? read(env, 'DIRECT_URL') : undefined;
  const url = direct ?? read(env, 'DATABASE_URL');
  const sslCaFile = read(env, 'DATABASE_SSL_CA_FILE');
  if (url) return { ...parseDatabaseUrl(url), ...(sslCaFile ? { sslCaFile } : {}) };

  const problems: string[] = [];
  const host = read(env, 'PG_HOST') ?? 'localhost';
  const port = readInt(env, 'PG_PORT', problems, 5432) ?? 5432;
  const user = read(env, 'PG_USER');
  const password = read(env, 'PG_PASSWORD');
  const database = read(env, 'PG_DATABASE');
  if (!user) problems.push('PG_USER is required');
  if (password === undefined) problems.push('PG_PASSWORD is required');
  if (!database) problems.push('PG_DATABASE is required');
  const ssl = readBool(env, 'PG_SSL', problems, false);
  if (problems.length) throw new EnvValidationError(problems);
  return { host, port, user: user!, password: password!, database: database!, ssl };
}

export function loadAppEnv(env: Env = process.env): AppEnv {
  const problems: string[] = [];

  const nodeEnvRaw = read(env, 'NODE_ENV') ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnvRaw)) {
    problems.push('NODE_ENV must be development, test or production');
  }
  const nodeEnv = nodeEnvRaw as NodeEnv;
  const isProd = nodeEnv === 'production';

  const port = readInt(env, 'PORT', problems, 5000) ?? 5000;
  const publicUrl = (read(env, 'PUBLIC_URL') ?? `http://127.0.0.1:${port}`).replace(/\/$/, '');

  const corsOrigins = readList(env, 'CORS_ORIGINS') ?? [];
  if (isProd && corsOrigins.length === 0) problems.push('CORS_ORIGINS is required in production');
  if (corsOrigins.includes('*')) problems.push('CORS_ORIGINS must not contain "*"');

  const jwtSecret = read(env, 'JWT_SECRET') ?? '';
  if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    problems.push(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
  }
  if (INSECURE_JWT_SECRETS.includes(jwtSecret)) problems.push('JWT_SECRET must not be a placeholder value');

  const rateTtl = readInt(env, 'RATE_LIMIT_TTL_MS', problems, 60_000) ?? 60_000;
  const rateLimit = readInt(env, 'RATE_LIMIT_LIMIT', problems, 120) ?? 120;

  const seedDemoData = readBool(env, 'SEED_DEMO_DATA', problems, false);
  if (seedDemoData && isProd) problems.push('SEED_DEMO_DATA must not be true in production');
  const adminPw = read(env, 'DEMO_ADMIN_PASSWORD');
  const customerPw = read(env, 'DEMO_CUSTOMER_PASSWORD');
  if (seedDemoData && (!adminPw || !customerPw)) {
    problems.push('DEMO_ADMIN_PASSWORD and DEMO_CUSTOMER_PASSWORD are required when SEED_DEMO_DATA=true');
  }

  const gstModeRaw = read(env, 'GST_MODE');
  if (gstModeRaw !== undefined && gstModeRaw !== 'inclusive' && gstModeRaw !== 'exclusive') {
    problems.push('GST_MODE must be "inclusive" or "exclusive"');
  }

  const store: StoreEnv = {
    shippingFeePaise: readInt(env, 'SHIPPING_FEE_PAISE', problems),
    gstRateBasisPoints: readInt(env, 'GST_RATE_BASIS_POINTS', problems),
    gstMode: gstModeRaw === 'inclusive' || gstModeRaw === 'exclusive' ? gstModeRaw : null,
    minOrderPaise: readInt(env, 'MIN_ORDER_PAISE', problems),
    codEnabled: readBool(env, 'COD_ENABLED', problems, false),
    serviceablePincodes: readList(env, 'SERVICEABLE_PINCODES'),
  };

  if (problems.length) throw new EnvValidationError(problems);

  return {
    nodeEnv,
    port,
    publicUrl,
    corsOrigins,
    database: loadDatabaseEnv(env),
    jwt: {
      secret: jwtSecret,
      expiresIn: read(env, 'JWT_EXPIRES_IN') ?? '12h',
      issuer: read(env, 'JWT_ISSUER') ?? 'volten-api',
      audience: read(env, 'JWT_AUDIENCE') ?? 'volten-storefront',
    },
    rateLimit: { ttlMs: rateTtl, limit: rateLimit },
    uploadDir: read(env, 'UPLOAD_DIR') ?? 'uploads',
    logRequests: readBool(env, 'LOG_REQUESTS', problems, true),
    seedDemoData,
    demoPasswords: seedDemoData ? { admin: adminPw!, customer: customerPw! } : null,
    store,
  };
}

export { EnvValidationError };
