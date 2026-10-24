import { z } from 'zod';

// Fails at startup on a malformed variable, not on the first request. Defaults match
// docker-compose.yml, so a local run needs no environment — except the database password,
// which production must set: a forgotten variable must not fall back to a known value.
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DB_HOST: z.string().min(1).default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(3307),
  DB_USER: z.string().min(1).default('aiue'),
  DB_PASSWORD: z.string().optional(),
  DB_NAME: z.string().min(1).default('ai_unit_economics'),
  // 0 disables the background loop; facts can still be derived with the CLI.
  FACT_DERIVATION_INTERVAL_MS: z.coerce.number().int().nonnegative().default(2000),
});

const DEV_DB_PASSWORD = 'aiue';

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export interface ApiConfig {
  port: number;
  database: DatabaseConfig;
  factDerivationIntervalMs: number;
}

/** What the Nest application needs; the HTTP port stays with main.ts. */
export type AppOptions = Pick<ApiConfig, 'database' | 'factDerivationIntervalMs'>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const parsed = envSchema.parse(env);
  if (parsed.DB_PASSWORD === undefined && env.NODE_ENV === 'production') {
    throw new Error('DB_PASSWORD is required when NODE_ENV=production');
  }
  return {
    port: parsed.PORT,
    factDerivationIntervalMs: parsed.FACT_DERIVATION_INTERVAL_MS,
    database: {
      host: parsed.DB_HOST,
      port: parsed.DB_PORT,
      username: parsed.DB_USER,
      password: parsed.DB_PASSWORD ?? DEV_DB_PASSWORD,
      database: parsed.DB_NAME,
    },
  };
}
