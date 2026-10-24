import type { DatabaseConfig } from '../src/config/env.config.js';

/**
 * A separate database, recreated on every run. Root is needed to create it; the defaults
 * match docker-compose.yml and the CI service. See ADR-0009.
 */
export function testDatabaseConfig(): DatabaseConfig {
  return {
    host: process.env.TEST_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.TEST_DB_PORT ?? 3307),
    username: process.env.TEST_DB_USER ?? 'root',
    password: process.env.TEST_DB_PASSWORD ?? 'root',
    database: process.env.TEST_DB_NAME ?? 'ai_unit_economics_test',
  };
}
