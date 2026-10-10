/** Drops all AllocFlow data and re-seeds from scratch. Development only. */
import { createDatabase } from './connection';
import { runMigrations } from './migrate';
import { seed } from './seed';
import { loadEnv } from '../config/env';

async function main() {
  const env = loadEnv();
  if (env.NODE_ENV === 'production') {
    throw new Error('db:reset refuses to run with NODE_ENV=production.');
  }
  const handle = await createDatabase(env.DATABASE_URL);
  await runMigrations(handle);
  await seed(handle.db, { force: true });
  await handle.close();
  console.log('[reset] database reset and re-seeded');
}

main().catch((err) => {
  console.error('[reset] failed:', err);
  process.exit(1);
});
