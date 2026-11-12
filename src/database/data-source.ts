/**
 * TypeORM CLI data source. Used only by migration commands:
 *   npm run migration:run      (apply pending migrations)
 *   npm run migration:revert   (revert the last migration)
 * Reads PG_* variables from the environment (or from .env, which is loaded first).
 */
import '../config/load-env';
import { DataSource } from 'typeorm';
import { loadDatabaseEnv } from '../config/env';
import { buildTypeOrmOptions } from './database.options';

export default new DataSource(buildTypeOrmOptions(loadDatabaseEnv(process.env, 'migration')));
