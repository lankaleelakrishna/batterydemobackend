/**
 * Side-effect module. Import it first so `.env` is loaded before any module
 * reads process.env at import time (for example the upload directory).
 * Variables already set in the real environment always win.
 */
import { existsSync } from 'fs';
import { resolve } from 'path';

const file = resolve(process.cwd(), '.env');
if (existsSync(file) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(file);
}
