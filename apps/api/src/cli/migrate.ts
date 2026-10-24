import { loadConfig } from '../config/env.config.js';
import { createDataSource } from '../config/typeorm.config.js';

const dataSource = await createDataSource(loadConfig().database).initialize();
try {
  const applied = await dataSource.runMigrations({ transaction: 'each' });
  console.log(
    applied.length ? applied.map((m) => `applied ${m.name}`).join('\n') : 'schema up to date',
  );
} finally {
  await dataSource.destroy();
}
