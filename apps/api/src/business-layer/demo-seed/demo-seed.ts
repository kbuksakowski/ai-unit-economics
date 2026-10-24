import { MAX_EVENTS_PER_BATCH, type UsageEvent } from '@ai-unit-economics/contracts';

import type { ProjectRepositoryService } from '../../data-access-layer/project-entity/providers/project.repository.service.js';
import { API_KEY_PREFIX, generateApiKey, hashApiKey } from '../../utils/api-key.util.js';
import type { FactDerivationService } from '../fact-derivation/services/fact-derivation.service.js';
import type { IngestionService } from '../ingestion/services/ingestion.service.js';

export interface DemoSeedServices {
  projects: ProjectRepositoryService;
  ingestion: IngestionService;
  derivation: FactDerivationService;
}

export interface DemoSeedKeys {
  ingestionKey: string;
  readKey: string;
}

export interface DemoSeedResult {
  /** False when a project with these keys already exists; nothing was written. */
  seeded: boolean;
  projectId: string;
  ingestionKey: string;
  readKey: string;
  accepted: number;
  rejected: number;
}

/**
 * Seeds a fresh project through ingestion and fact derivation — the path real events take,
 * minus HTTP — so the demo shows only figures the system computes itself.
 */
export async function seedDemo(
  services: DemoSeedServices,
  events: UsageEvent[],
  options: { name?: string; keys?: DemoSeedKeys } = {},
): Promise<DemoSeedResult> {
  const ingestionKey = options.keys?.ingestionKey ?? generateApiKey(API_KEY_PREFIX.ingestion);
  const readKey = options.keys?.readKey ?? generateApiKey(API_KEY_PREFIX.read);

  // Fixed demo keys make a second `docker compose up` a no-op instead of a duplicate project.
  const existing = await services.projects.findForReadKeyAuth(hashApiKey(readKey));
  if (existing) {
    return {
      seeded: false,
      projectId: existing.id,
      ingestionKey,
      readKey,
      accepted: 0,
      rejected: 0,
    };
  }
  const projectId = await services.projects.insert(
    options.name ?? 'demo',
    hashApiKey(ingestionKey),
    hashApiKey(readKey),
  );

  let accepted = 0;
  let rejected = 0;
  for (let i = 0; i < events.length; i += MAX_EVENTS_PER_BATCH) {
    const response = await services.ingestion.ingest(projectId, {
      sdk: { name: '@ai-unit-economics/demo-seed', version: '0.0.0' },
      events: events.slice(i, i + MAX_EVENTS_PER_BATCH),
    });
    accepted += response.successes.length;
    rejected += response.errors.length;
  }
  await services.derivation.deriveAll();
  return { seeded: true, projectId, ingestionKey, readKey, accepted, rejected };
}
