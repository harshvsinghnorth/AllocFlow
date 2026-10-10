/**
 * Environment loading and validation.
 *
 * Fails fast at boot on anything missing or malformed, so a misconfigured
 * deployment never reaches the first request. The one deliberate exception is
 * JWT_SECRET, which falls back to a development-only value; that fallback is
 * refused outright when NODE_ENV=production.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface AppEnv {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  DATABASE_URL: string | undefined;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  CORS_ORIGINS: string[];
  AUTO_MIGRATE: boolean;
  AUTO_SEED: boolean;
}

const DEV_JWT_SECRET = 'allocflow-development-secret-do-not-use-in-production';

/** Minimal .env reader — avoids a dependency for a dozen lines of parsing. */
function loadDotEnv(): void {
  for (const file of ['.env', '../.env']) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
    break;
  }
}

let cached: AppEnv | undefined;

export function loadEnv(): AppEnv {
  if (cached) return cached;
  loadDotEnv();

  const nodeEnv = (process.env.NODE_ENV ?? 'development') as AppEnv['NODE_ENV'];
  const isProd = nodeEnv === 'production';

  const port = Number(process.env.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${process.env.PORT}`);
  }

  const jwtSecret = process.env.JWT_SECRET?.trim();
  if (isProd && (!jwtSecret || jwtSecret === DEV_JWT_SECRET)) {
    throw new Error(
      'JWT_SECRET must be set to a strong unique value when NODE_ENV=production.',
    );
  }
  if (isProd && jwtSecret!.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production.');
  }

  cached = {
    NODE_ENV: nodeEnv,
    PORT: port,
    DATABASE_URL: process.env.DATABASE_URL?.trim() || undefined,
    JWT_SECRET: jwtSecret || DEV_JWT_SECRET,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '12h',
    CORS_ORIGINS: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    AUTO_MIGRATE: (process.env.AUTO_MIGRATE ?? 'true') !== 'false',
    AUTO_SEED: (process.env.AUTO_SEED ?? 'true') !== 'false',
  };
  return cached;
}
