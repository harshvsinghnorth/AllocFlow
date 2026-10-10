/**
 * Applies the generated SQL migrations against whichever driver DATABASE_URL
 * selects. Run via `npm run db:migrate`; also invoked at boot when
 * AUTO_MIGRATE=true so a fresh checkout comes up with a ready database.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { createDatabase, type DatabaseHandle } from './connection';
import { loadEnv } from '../config/env';

/**
 * Locates the migrations folder for both `tsx src/...` (development) and
 * `node dist/...` (production), where the .sql files are not copied.
 */
export function migrationsFolder(): string {
  const candidates = [
    join(__dirname, 'migrations'),
    resolve(process.cwd(), 'src/database/migrations'),
    resolve(process.cwd(), 'server/src/database/migrations'),
  ];
  const found = candidates.find((c) => existsSync(join(c, 'meta', '_journal.json')));
  if (!found) {
    throw new Error(
      `Could not locate migrations folder. Looked in:\n  ${candidates.join('\n  ')}`,
    );
  }
  return found;
}

export async function runMigrations(handle: DatabaseHandle): Promise<void> {
  const folder = migrationsFolder();
  if (handle.driver === 'postgres') {
    await migratePg(handle.db, { migrationsFolder: folder });
  } else {
    // The PGlite migrator needs the driver-native database instance.
    await migratePglite(drizzlePglite(handle.pglite!), { migrationsFolder: folder });
  }
}

async function main() {
  const env = loadEnv();
  const handle = await createDatabase(env.DATABASE_URL);
  console.log(`[migrate] driver=${handle.driver}`);
  await runMigrations(handle);
  console.log('[migrate] migrations applied');
  await handle.close();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[migrate] failed:', err);
    process.exit(1);
  });
}
