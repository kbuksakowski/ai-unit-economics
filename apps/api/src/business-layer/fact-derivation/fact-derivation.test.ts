import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startTestApp, type TestApp } from '../../../test/app.js';

let app: TestApp;

beforeAll(async () => {
  app = await startTestApp();
});

afterAll(async () => {
  await app.close();
});

/** A valid UUIDv7: version and variant nibbles fixed, the rest random. */
function uuidv7(): string {
  const hex = randomUUID().replace(/-/g, '');
  return `0199a5b0-${hex.slice(0, 4)}-7${hex.slice(5, 8)}-8${hex.slice(9, 12)}-${hex.slice(12, 24)}`;
}

// After the pricing snapshot's validFrom (2026-10-03T10:52:28Z).
const PRICED_AT = '2026-10-04T12:00:00.000Z';

function event(overrides: Record<string, unknown> = {}) {
  const id = uuidv7();
  return {
    idempotencyKey: id,
    usageEventId: id,
    occurredAt: PRICED_AT,
    provider: 'anthropic',
    providerClient: { name: '@anthropic-ai/sdk' },
    requestedModel: 'claude-sonnet-5-5',
    respondedModel: 'claude-sonnet-5-5',
    operation: 'chat',
    customerId: 'cust_42',
    status: 'success',
    usageStatus: 'reported',
    rawUsage: { input_tokens: 1000, output_tokens: 500 },
    ...overrides,
  };
}

async function ingest(apiKey: string, ...events: unknown[]): Promise<void> {
  const response = await fetch(`${app.url}/v1/usage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ sdk: { name: '@ai-unit-economics/sdk', version: '0.0.0' }, events }),
  });
  expect(response.status).toBe(200);
}

/** Ingests one event into a fresh project, derives, and returns that project's facts. */
async function deriveOne(overrides: Record<string, unknown> = {}) {
  const project = await app.createProject();
  await ingest(project.apiKey, event(overrides));
  await app.derivation.deriveAll();
  const usageFacts = await app.usageFacts.findAllByProjectId(project.id);
  const costFacts = await app.costFacts.findAllByProjectId(project.id);
  expect(usageFacts).toHaveLength(1);
  expect(costFacts).toHaveLength(1);
  return { project, usageFact: usageFacts[0]!, costFact: costFacts[0]! };
}

describe('fact derivation', () => {
  it('normalises and prices a reported event with the pinned pricing version', async () => {
    const { usageFact, costFact } = await deriveOne({
      rawUsage: {
        input_tokens: 100,
        output_tokens: 300,
        cache_read_input_tokens: 40_000,
        cache_creation_input_tokens: 10_000,
        cache_creation: { ephemeral_5m_input_tokens: 8_000, ephemeral_1h_input_tokens: 2_000 },
      },
    });

    expect(usageFact).toMatchObject({
      normalizationVersion: 'anthropic-2',
      status: 'NORMALIZED',
      inputTokens: '50100',
      outputTokens: '300',
      cachedInputTokens: '40000',
      attributionStatus: 'ATTRIBUTED',
    });
    // Sonnet 5.5, official rates: 100 × 2 + 40000 × 0.2 + 8000 × 2.5 + 2000 × 4 + 300 × 10,
    // all per million = 0.0002 + 0.008 + 0.02 + 0.008 + 0.003 = 0.0392
    expect(costFact).toMatchObject({
      status: 'PRICED',
      amount: '0.039200000000',
      currency: 'USD',
      revision: 1,
      supersedesId: null,
      reason: 'INITIAL',
      customerId: 'cust_42',
    });
    expect(costFact.pricingVersion).toMatch(/^anthropic-2026-10-03-[0-9a-f]{8}$/);
  });

  it('prices the first real Anthropic usage object end to end', async () => {
    // A real Haiku 4.5 response of 2026-10-03: usage exactly as returned.
    const { costFact } = await deriveOne({
      requestedModel: 'claude-haiku-4-5',
      respondedModel: 'claude-haiku-4-5-20251001',
      rawUsage: {
        input_tokens: 14,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
        output_tokens: 4,
        service_tier: 'standard',
        inference_geo: 'not_available',
      },
    });
    // 14 × $1/M + 4 × $5/M
    expect(costFact).toMatchObject({ status: 'PRICED', amount: '0.000034000000' });
  });

  it('prices the real usage object of 2026-10-24, which added speed', async () => {
    // A real Haiku 4.5 response of 2026-10-24: usage exactly as returned.
    const { usageFact, costFact } = await deriveOne({
      requestedModel: 'claude-haiku-4-5',
      respondedModel: 'claude-haiku-4-5-20251001',
      rawUsage: {
        input_tokens: 14,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
        output_tokens: 4,
        service_tier: 'standard',
        inference_geo: 'not_available',
        speed: 'standard',
      },
    });
    expect(usageFact).toMatchObject({ status: 'NORMALIZED', speed: 'standard' });
    // 14 × $1/M + 4 × $5/M
    expect(costFact).toMatchObject({ status: 'PRICED', amount: '0.000034000000' });
  });

  it('leaves fast mode unpriced rather than priced at the standard rate', async () => {
    const { costFact } = await deriveOne({
      rawUsage: { input_tokens: 1000, output_tokens: 500, speed: 'fast' },
    });
    expect(costFact).toMatchObject({ status: 'MISSING_PRICE_COMPONENT', amount: null });
    expect(costFact.missingComponents).toEqual(['speed:fast']);
  });

  it('records a stream as not measured, never as zero', async () => {
    const { usageFact, costFact } = await deriveOne({
      usageStatus: 'not_reported',
      rawUsage: undefined,
    });
    expect(usageFact).toMatchObject({ status: 'NOT_REPORTED', inputTokens: null });
    expect(costFact).toMatchObject({ status: 'NOT_MEASURED', amount: null });
  });

  it('records an unrecognised usage shape and does not price it', async () => {
    const { usageFact, costFact } = await deriveOne({
      rawUsage: { input_tokens: 1, output_tokens: 1, brand_new_bucket: 5 },
    });
    expect(usageFact.status).toBe('UNRECOGNIZED_SHAPE');
    expect(usageFact.statusReason).toContain('brand_new_bucket');
    expect(costFact).toMatchObject({ status: 'USAGE_UNRECOGNIZED', amount: null });
  });

  it.each([
    ['an unknown model', { respondedModel: 'claude-unknown-9' }, 'UNKNOWN_MODEL'],
    [
      'an event older than the first price',
      { occurredAt: '2026-10-01T00:00:00.000Z' },
      'NO_RATE_FOR_PERIOD',
    ],
  ])('gives %s a status and no amount', async (_, overrides, status) => {
    const { costFact } = await deriveOne(overrides);
    expect(costFact).toMatchObject({ status, amount: null });
  });

  it('withholds the amount for an unpriced variant but keeps the known parts', async () => {
    const { costFact } = await deriveOne({
      rawUsage: { input_tokens: 1000, output_tokens: 500, inference_geo: 'us' },
    });
    expect(costFact).toMatchObject({ status: 'MISSING_PRICE_COMPONENT', amount: null });
    expect(costFact.missingComponents).toEqual(['inference_geo:us']);
    // 1000 × $2/M
    expect(costFact.costDetails).toMatchObject({ input: '0.002000' });
  });

  it('marks usage without a customer as unattributed on both facts', async () => {
    const { customerId: _, ...withoutCustomer } = event();
    const project = await app.createProject();
    await ingest(project.apiKey, withoutCustomer);
    await app.derivation.deriveAll();
    const [costFact] = await app.costFacts.findAllByProjectId(project.id);
    expect(costFact).toMatchObject({ attributionStatus: 'UNATTRIBUTED', status: 'PRICED' });
  });

  it('is idempotent: re-running and re-delivering never add a second fact', async () => {
    const project = await app.createProject();
    const sent = event();
    await ingest(project.apiKey, sent);
    await app.derivation.deriveAll();
    await ingest(project.apiKey, sent);
    await app.derivation.deriveAll();
    await app.derivation.deriveAll();

    expect(await app.usageFacts.findAllByProjectId(project.id)).toHaveLength(1);
    expect(await app.costFacts.findAllByProjectId(project.id)).toHaveLength(1);
  });
});

describe('cost fact revisions', () => {
  it('appends a correction that supersedes the original without touching it', async () => {
    const { project, costFact: original } = await deriveOne();

    const outcome = await app.costFacts.insertCorrection(project.id, original, {
      usageFactId: original.usageFactId,
      pricingVersion: 'anthropic-test-corrected',
      status: 'PRICED',
      amount: '0.005',
      currency: 'USD',
      costDetails: {},
      missingComponents: [],
      rateValidFrom: null,
      respondedModel: original.respondedModel,
      customerId: original.customerId,
      feature: original.feature,
      attributionStatus: original.attributionStatus,
      occurredAt: original.occurredAt,
    });
    expect(outcome).toBe('created');

    const all = await app.costFacts.findAllByProjectId(project.id);
    expect(all).toHaveLength(2);
    expect(all[0]).toEqual(original);
    expect(all[1]).toMatchObject({
      revision: 2,
      supersedesId: original.id,
      reason: 'PRICING_CORRECTION',
    });

    const current = await app.costFacts.findCurrentByProjectId(project.id);
    expect(current.map((c) => c.amount)).toEqual(['0.005000000000']);
  });

  it('refuses a second correction of the same fact: the history stays a single line', async () => {
    const { project, costFact: original } = await deriveOne();
    // Spreading the row on purpose: the repository must not reuse its id.
    const correction = { ...original, pricingVersion: 'v2' };
    expect(await app.costFacts.insertCorrection(project.id, original, correction)).toBe('created');
    expect(await app.costFacts.insertCorrection(project.id, original, correction)).toBe(
      'duplicate',
    );
  });
});
