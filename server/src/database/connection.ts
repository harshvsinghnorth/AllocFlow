/**
 * Database connection factory.
 *
 * AllocFlow targets PostgreSQL. Two drivers speak that same dialect, and the
 * driver is chosen from DATABASE_URL alone:
 *
 *   postgres://... / postgresql://...  -> node-postgres against a real server
 *                                         (docker-compose, RDS, Neon, ...)
 *   file:./data/allocflow  (or unset)  -> PGlite, PostgreSQL compiled to WASM
 *                                         and persisted to disk, in-process
 *
 * The schema, the SQL migrations and every query in the application are
 * identical across both. PGlite exists so the project runs with zero setup;
 * production deployments point DATABASE_URL at a managed Postgres instance.
 */
import { drizzle as drizzlePg, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Pool } from 'pg';
import * as schema from './schema';

/**
 * Application-facing database type. Both drivers implement the same PgDatabase
 * query builder, so the rest of the codebase is written against one type and
 * never branches on which driver is live.
 */
export type Db = NodePgDatabase<typeof schema>;

export type DriverKind = 'postgres' | 'pglite';

export interface DatabaseHandle {
  db: Db;
  driver: DriverKind;
  /** Present only for PGlite; the migrator needs the raw client. */
  pglite?: PGlite;
  pool?: Pool;
  close: () => Promise<void>;
}

export const resolveDriver = (url: string | undefined): DriverKind =>
  url && /^postgres(ql)?:\/\//i.test(url) ? 'postgres' : 'pglite';

/** Strips the `file:` prefix and defaults to ./data/allocflow for PGlite. */
export const resolvePgliteDir = (url: string | undefined): string => {
  if (!url) return './data/allocflow';
  return url.replace(/^file:/i, '') || './data/allocflow';
};

export async function createDatabase(url: string | undefined): Promise<DatabaseHandle> {
  const driver = resolveDriver(url);

  if (driver === 'postgres') {
    const pool = new Pool({
      connectionString: url,
      max: Number(process.env.DB_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    // Fail fast at boot rather than on the first request.
    const probe = await pool.connect();
    probe.release();
    return {
      db: drizzlePg(pool, { schema }),
      driver,
      pool,
      close: () => pool.end(),
    };
  }

  const dataDir = resolvePgliteDir(url);
  // PGlite creates its own leaf directory but not the parents above it.
  mkdirSync(dirname(resolve(dataDir)), { recursive: true });
  const pglite = new PGlite(dataDir);
  await pglite.waitReady;
  return {
    db: drizzlePglite(pglite, { schema }) as unknown as Db,
    driver,
    pglite,
    close: () => pglite.close(),
  };
}
