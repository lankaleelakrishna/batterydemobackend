import { DatabaseEnv } from '../../config/env';

/**
 * Decides whether the demo seed may write to a database. Narrow by design:
 *
 * 1. The default rule: the database name must contain "volten", so a seed
 *    never lands in an arbitrary database.
 * 2. One explicit exception, for the VOLTEX development project on Supabase.
 *    It needs ALL of: NODE_ENV=development, SEED_TARGET_PROJECT_REF set to the
 *    project reference, the database name "postgres", a Supabase pooler host,
 *    and a DB user of the form "postgres.<project reference>" that matches
 *    SEED_TARGET_PROJECT_REF. Any mismatch is refused, with the reason.
 */
export interface SeedTargetDecision {
  allowed: boolean;
  reason: string;
}

export function decideSeedTarget(
  db: Pick<DatabaseEnv, 'host' | 'database' | 'user'>,
  env: Record<string, string | undefined>,
): SeedTargetDecision {
  if (/volten/i.test(db.database)) {
    return { allowed: true, reason: `database "${db.database}" is a VOLTEX database` };
  }

  const nodeEnv = env.NODE_ENV ?? 'development';
  const ref = (env.SEED_TARGET_PROJECT_REF ?? '').trim();
  if (nodeEnv !== 'development') {
    return { allowed: false, reason: 'the Supabase exception only applies when NODE_ENV=development' };
  }
  if (!/^[a-z0-9]{20}$/.test(ref)) {
    return { allowed: false, reason: 'SEED_TARGET_PROJECT_REF must be the 20-character Supabase project reference' };
  }
  if (db.database !== 'postgres') {
    return { allowed: false, reason: `the Supabase exception only covers database "postgres" (got "${db.database}")` };
  }
  if (!/\.pooler\.supabase\.com$/.test(db.host)) {
    return { allowed: false, reason: 'the Supabase exception only covers a Supabase pooler host' };
  }
  if (db.user !== `postgres.${ref}`) {
    return { allowed: false, reason: 'the database user does not belong to SEED_TARGET_PROJECT_REF' };
  }
  return { allowed: true, reason: `Supabase project ${ref}, database "postgres", development override` };
}
