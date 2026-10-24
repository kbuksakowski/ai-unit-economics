import { DataSource } from 'typeorm';

import { createDataSource } from '../src/config/typeorm.config.js';
import { testDatabaseConfig } from './database.js';

/** Recreates the test database and applies the real migrations, as production would. */
export default async function setup(): Promise<void> {
  const config = testDatabaseConfig();
  const admin = await new DataSource({
    type: 'mariadb',
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
  }).initialize();
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${config.database}\``);
    await admin.query(`CREATE DATABASE \`${config.database}\``);
  } finally {
    await admin.destroy();
  }

  const dataSource = await createDataSource(config).initialize();
  try {
    await dataSource.runMigrations({ transaction: 'each' });
  } finally {
    await dataSource.destroy();
  }
}
