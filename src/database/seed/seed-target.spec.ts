import { decideSeedTarget } from './seed-target';

const REF = 'nrbtwwtfqusylfvaytjd';
const supabase = { host: 'aws-0-ap-northeast-2.pooler.supabase.com', database: 'postgres', user: `postgres.${REF}` };
const dev = { NODE_ENV: 'development', SEED_TARGET_PROJECT_REF: REF };

describe('decideSeedTarget', () => {
  it('still accepts any database whose name contains volten', () => {
    expect(decideSeedTarget({ host: 'localhost', database: 'volten_dev', user: 'u' }, {}).allowed).toBe(true);
  });

  it('refuses an arbitrary database with no exception', () => {
    expect(decideSeedTarget({ host: 'localhost', database: 'postgres', user: 'u' }, dev).allowed).toBe(false);
  });

  it('accepts the Supabase postgres database for the matching project in development', () => {
    expect(decideSeedTarget(supabase, dev).allowed).toBe(true);
  });

  it('refuses the exception outside development', () => {
    const d = decideSeedTarget(supabase, { ...dev, NODE_ENV: 'production' });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/NODE_ENV=development/);
  });

  it('refuses when the project reference is missing or malformed', () => {
    expect(decideSeedTarget(supabase, { NODE_ENV: 'development' }).allowed).toBe(false);
    expect(decideSeedTarget(supabase, { NODE_ENV: 'development', SEED_TARGET_PROJECT_REF: 'short' }).allowed).toBe(false);
  });

  it('refuses a different database name, host, or user', () => {
    expect(decideSeedTarget({ ...supabase, database: 'other' }, dev).allowed).toBe(false);
    expect(decideSeedTarget({ ...supabase, host: 'db.example.com' }, dev).allowed).toBe(false);
    expect(decideSeedTarget({ ...supabase, user: 'postgres.someoneelse123456789' }, dev).allowed).toBe(false);
  });
});
