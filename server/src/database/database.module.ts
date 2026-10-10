import { Global, Module, OnModuleDestroy, Logger } from '@nestjs/common';
import { createDatabase, type DatabaseHandle, type Db } from './connection';
import { runMigrations } from './migrate';
import { seed } from './seed';
import { loadEnv } from '../config/env';

/** Injection token for the Drizzle database handle. */
export const DRIZZLE = Symbol('DRIZZLE');

/**
 * Owns the single database connection for the process. Marked @Global so
 * feature modules inject DRIZZLE without re-importing this module, and closes
 * the pool on shutdown so the process exits cleanly.
 */
@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      useFactory: async (): Promise<Db> => {
        const logger = new Logger('Database');
        const env = loadEnv();
        const handle = await createDatabase(env.DATABASE_URL);
        DatabaseModule.handle = handle;
        logger.log(`connected (driver=${handle.driver})`);

        if (env.AUTO_MIGRATE) {
          await runMigrations(handle);
          logger.log('migrations up to date');
        }
        if (env.AUTO_SEED) {
          await seed(handle.db);
        }
        return handle.db;
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule implements OnModuleDestroy {
  static handle: DatabaseHandle | undefined;

  async onModuleDestroy(): Promise<void> {
    await DatabaseModule.handle?.close();
    DatabaseModule.handle = undefined;
  }
}
