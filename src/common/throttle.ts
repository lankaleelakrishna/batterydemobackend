/**
 * Stricter per-route limits for sign-in, sign-up and public write endpoints.
 * Defaults are strict. They can be raised through RATE_LIMIT_AUTH_LIMIT and
 * RATE_LIMIT_WRITE_LIMIT (per minute, per client). Decorators are evaluated at
 * import time, so these values are read from the environment when the module loads.
 */
function limit(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw === undefined || raw.trim() === '' ? fallback : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export const AUTH_THROTTLE = { default: { limit: limit('RATE_LIMIT_AUTH_LIMIT', 10), ttl: 60_000 } };
export const WRITE_THROTTLE = { default: { limit: limit('RATE_LIMIT_WRITE_LIMIT', 5), ttl: 60_000 } };
