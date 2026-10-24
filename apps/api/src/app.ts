import 'reflect-metadata';

import { MAX_BODY_BYTES } from '@ai-unit-economics/contracts';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module.js';
import type { AppOptions } from './config/env.config.js';

// Shared by main.ts and the tests, so both run the same HTTP stack.
export async function createApp(options: AppOptions): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(options), {
    bodyParser: false,
    logger: ['error', 'warn'],
  });
  // Oversized bodies are answered 413 before parsing; the limit is part of the wire contract (ADR-0002).
  app.useBodyParser('json', { limit: MAX_BODY_BYTES });
  return app;
}
