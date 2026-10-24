import { DataSource, type DataSourceOptions } from 'typeorm';

import { CostFactEntity } from '../data-access-layer/cost-fact-entity/entities/cost-fact.entity.js';
import { ProjectEntity } from '../data-access-layer/project-entity/entities/project.entity.js';
import { RejectedEventEntity } from '../data-access-layer/rejected-event-entity/entities/rejected-event.entity.js';
import { UsageEventEntity } from '../data-access-layer/usage-event-entity/entities/usage-event.entity.js';
import { UsageFactEntity } from '../data-access-layer/usage-fact-entity/entities/usage-fact.entity.js';
import { InitialSchema1759449600000 } from '../migrations/1759449600000-initial-schema.js';
import { UsageAndCostFacts1759536000000 } from '../migrations/1759536000000-usage-and-cost-facts.js';
import { ProjectReadKey1759622400000 } from '../migrations/1759622400000-project-read-key.js';
import { UsageFactSpeed1761264000000 } from '../migrations/1761264000000-usage-fact-speed.js';
import { RejectedEventPayloadNullable1761350400000 } from '../migrations/1761350400000-rejected-event-payload-nullable.js';
import type { DatabaseConfig } from './env.config.js';

// `synchronize` stays off: it alters the schema silently, and facts here never change in place.
export function typeOrmOptions(config: DatabaseConfig): DataSourceOptions {
  return {
    type: 'mariadb',
    ...config,
    timezone: 'Z',
    entities: [
      ProjectEntity,
      UsageEventEntity,
      RejectedEventEntity,
      UsageFactEntity,
      CostFactEntity,
    ],
    migrations: [
      InitialSchema1759449600000,
      UsageAndCostFacts1759536000000,
      ProjectReadKey1759622400000,
      UsageFactSpeed1761264000000,
      RejectedEventPayloadNullable1761350400000,
    ],
    synchronize: false,
  };
}

/** For the CLI and test setup, which run outside the Nest container. */
export function createDataSource(config: DatabaseConfig): DataSource {
  return new DataSource(typeOrmOptions(config));
}
