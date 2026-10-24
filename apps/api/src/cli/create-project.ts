import { loadConfig } from '../config/env.config.js';
import { createDataSource } from '../config/typeorm.config.js';
import { ProjectEntity } from '../data-access-layer/project-entity/entities/project.entity.js';
import { ProjectRepositoryService } from '../data-access-layer/project-entity/providers/project.repository.service.js';
import { API_KEY_PREFIX, generateApiKey, hashApiKey } from '../utils/api-key.util.js';

// Prints both keys once; only their hashes are stored (ADR-0005).
const name = process.argv[2];
if (!name) {
  console.error('usage: pnpm --filter @ai-unit-economics/api create-project <name>');
  process.exit(1);
}

const dataSource = await createDataSource(loadConfig().database).initialize();
try {
  const ingestionKey = generateApiKey(API_KEY_PREFIX.ingestion);
  const readKey = generateApiKey(API_KEY_PREFIX.read);
  const projectId = await new ProjectRepositoryService(
    dataSource.getRepository(ProjectEntity),
  ).insert(name, hashApiKey(ingestionKey), hashApiKey(readKey));
  console.log(`project ${projectId} "${name}" created; keys are shown once, store them now`);
  console.log(`ingestion key (for the SDK):       ${ingestionKey}`);
  console.log(`read key (for the dashboard only): ${readKey}`);
} finally {
  await dataSource.destroy();
}
