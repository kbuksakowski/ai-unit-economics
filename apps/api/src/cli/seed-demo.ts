import 'reflect-metadata';

import { writeFile } from 'node:fs/promises';

import { ANTHROPIC_RATES } from '@ai-unit-economics/pricing-data';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module.js';
import { seedDemo, type DemoSeedKeys } from '../business-layer/demo-seed/demo-seed.js';
import { generateDemoEvents } from '../business-layer/demo-seed/demo-seed.util.js';
import { FactDerivationService } from '../business-layer/fact-derivation/services/fact-derivation.service.js';
import { IngestionService } from '../business-layer/ingestion/services/ingestion.service.js';
import { loadConfig } from '../config/env.config.js';
import { ProjectRepositoryService } from '../data-access-layer/project-entity/providers/project.repository.service.js';
import { API_KEY_PREFIX } from '../utils/api-key.util.js';

/**
 * Seeds a demo project. With AIUE_DEMO_INGESTION_KEY and AIUE_DEMO_READ_KEY set — as the
 * Docker demo profile does — it uses those keys and does nothing if already seeded.
 * Otherwise it generates keys and writes them to a git-ignored file, not to the terminal.
 */
const keys = fixedKeys(process.env);
const KEYS_FILE = process.argv[2] ?? '.env.demo';

const pricedFrom = new Date(
  ANTHROPIC_RATES.reduce(
    (min, r) => (r.validFrom < min ? r.validFrom : min),
    ANTHROPIC_RATES[0]!.validFrom,
  ),
);
const app = await NestFactory.createApplicationContext(
  AppModule.forRoot({ ...loadConfig(), factDerivationIntervalMs: 0 }),
  { logger: ['error', 'warn'] },
);
try {
  const result = await seedDemo(
    {
      projects: app.get(ProjectRepositoryService),
      ingestion: app.get(IngestionService),
      derivation: app.get(FactDerivationService),
    },
    generateDemoEvents({ now: new Date(), pricedFrom }),
    keys ? { keys } : {},
  );
  if (!result.seeded) {
    console.log(`demo project ${result.projectId} already seeded; nothing to do`);
  } else {
    console.log(
      `demo project ${result.projectId}: ${result.accepted} events accepted, ${result.rejected} rejected`,
    );
    if (!keys) {
      await writeFile(
        KEYS_FILE,
        `# demo project ${result.projectId}; local development only\nAIUE_INGESTION_KEY=${result.ingestionKey}\nAIUE_READ_KEY=${result.readKey}\n`,
      );
      console.log(`keys written to ${KEYS_FILE}`);
    }
  }
} finally {
  await app.close();
}

function fixedKeys(env: NodeJS.ProcessEnv): DemoSeedKeys | null {
  const ingestionKey = env.AIUE_DEMO_INGESTION_KEY;
  const readKey = env.AIUE_DEMO_READ_KEY;
  if (!ingestionKey && !readKey) return null;
  if (
    !ingestionKey?.startsWith(API_KEY_PREFIX.ingestion) ||
    !readKey?.startsWith(API_KEY_PREFIX.read)
  ) {
    console.error(
      `AIUE_DEMO_INGESTION_KEY must start with ${API_KEY_PREFIX.ingestion} and AIUE_DEMO_READ_KEY with ${API_KEY_PREFIX.read}`,
    );
    process.exit(1);
  }
  return { ingestionKey, readKey };
}
