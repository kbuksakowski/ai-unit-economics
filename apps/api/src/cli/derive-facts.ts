import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module.js';
import { FactDerivationService } from '../business-layer/fact-derivation/services/fact-derivation.service.js';
import { loadConfig } from '../config/env.config.js';

// Derives every missing fact once and exits; the same routine the background loop runs.
const app = await NestFactory.createApplicationContext(
  AppModule.forRoot({ ...loadConfig(), factDerivationIntervalMs: 0 }),
  { logger: ['error', 'warn'] },
);
try {
  const result = await app.get(FactDerivationService).deriveAll();
  console.log(`derived ${result.usageFacts} usage facts, ${result.costFacts} cost facts`);
} finally {
  await app.close();
}
