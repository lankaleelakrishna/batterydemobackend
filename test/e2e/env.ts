/**
 * Runs before each end-to-end test file.
 *
 * Every business-rule value below is a TEST FIXTURE so checkout can be exercised.
 * They are not decisions about shipping, GST, delivery areas or COD for production.
 */
import { tmpdir } from 'os';
import { join } from 'path';

process.env.NODE_ENV = 'test';
if (!process.env.PG_DATABASE || !/test/i.test(process.env.PG_DATABASE)) {
  throw new Error('Set PG_DATABASE to the isolated test database (for example volten_test) before running e2e tests.');
}
process.env.JWT_SECRET =
  process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32 ? process.env.JWT_SECRET : 'e2e-only-secret-'.padEnd(48, 'x');
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.RATE_LIMIT_LIMIT = '100000';
process.env.RATE_LIMIT_AUTH_LIMIT = '100000';
process.env.RATE_LIMIT_WRITE_LIMIT = '100000';
process.env.LOG_REQUESTS = 'false';
process.env.UPLOAD_DIR = join(tmpdir(), 'volten-e2e-uploads');

// Test fixtures for checkout.
process.env.SHIPPING_FEE_PAISE = '5000';
process.env.GST_RATE_BASIS_POINTS = '1800';
process.env.GST_MODE = 'exclusive';
process.env.COD_ENABLED = 'true';
process.env.SERVICEABLE_PINCODES = '500001,560001';
delete process.env.MIN_ORDER_PAISE;
