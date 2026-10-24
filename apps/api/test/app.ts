import type { AddressInfo } from 'node:net';

import type { NestExpressApplication } from '@nestjs/platform-express';

import { createApp } from '../src/app.js';
import { IngestionService } from '../src/business-layer/ingestion/services/ingestion.service.js';
import { FactDerivationService } from '../src/business-layer/fact-derivation/services/fact-derivation.service.js';
import { CostFactRepositoryService } from '../src/data-access-layer/cost-fact-entity/providers/cost-fact.repository.service.js';
import { ProjectRepositoryService } from '../src/data-access-layer/project-entity/providers/project.repository.service.js';
import { RejectedEventRepositoryService } from '../src/data-access-layer/rejected-event-entity/providers/rejected-event.repository.service.js';
import { UsageEventRepositoryService } from '../src/data-access-layer/usage-event-entity/providers/usage-event.repository.service.js';
import { UsageFactRepositoryService } from '../src/data-access-layer/usage-fact-entity/providers/usage-fact.repository.service.js';
import { API_KEY_PREFIX, generateApiKey, hashApiKey } from '../src/utils/api-key.util.js';
import { testDatabaseConfig } from './database.js';

export interface TestApp {
  url: string;
  usageEvents: UsageEventRepositoryService;
  rejectedEvents: RejectedEventRepositoryService;
  usageFacts: UsageFactRepositoryService;
  costFacts: CostFactRepositoryService;
  derivation: FactDerivationService;
  ingestion: IngestionService;
  projects: ProjectRepositoryService;
  /** Every test gets its own project, so files can run in parallel on one database. */
  createProject(): Promise<{ id: string; apiKey: string; readKey: string }>;
  close(): Promise<void>;
}

/** The background loop is off unless a test asks for it, so tests derive facts explicitly. */
export async function startTestApp({ factDerivationIntervalMs = 0 } = {}): Promise<TestApp> {
  const app: NestExpressApplication = await createApp({
    database: testDatabaseConfig(),
    factDerivationIntervalMs,
  });
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  const projects = app.get(ProjectRepositoryService);
  return {
    url: `http://127.0.0.1:${port}`,
    usageEvents: app.get(UsageEventRepositoryService),
    rejectedEvents: app.get(RejectedEventRepositoryService),
    usageFacts: app.get(UsageFactRepositoryService),
    costFacts: app.get(CostFactRepositoryService),
    derivation: app.get(FactDerivationService),
    ingestion: app.get(IngestionService),
    projects,
    createProject: async () => {
      const apiKey = generateApiKey(API_KEY_PREFIX.ingestion);
      const readKey = generateApiKey(API_KEY_PREFIX.read);
      const id = await projects.insert('test', hashApiKey(apiKey), hashApiKey(readKey));
      return { id, apiKey, readKey };
    },
    close: () => app.close(),
  };
}
