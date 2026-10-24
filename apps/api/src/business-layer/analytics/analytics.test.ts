import { randomUUID } from 'node:crypto';

import {
  costOverviewResponseSchema,
  costSummaryResponseSchema,
} from '@ai-unit-economics/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startTestApp, type TestApp } from '../../../test/app.js';

let app: TestApp;

beforeAll(async () => {
  app = await startTestApp();
});

afterAll(async () => {
  await app.close();
});

function uuidv7(): string {
  const hex = randomUUID().replace(/-/g, '');
  return `0199a5b0-${hex.slice(0, 4)}-7${hex.slice(5, 8)}-8${hex.slice(9, 12)}-${hex.slice(12, 24)}`;
}

const FROM = '2026-10-04T00:00:00.000Z';
const TO = '2026-10-05T00:00:00.000Z';
const INSIDE = '2026-10-04T12:00:00.000Z';

/** Sonnet 5.5 at the official $2 input / $10 output per million. */
function event(
  customerId: string | null,
  inputTokens: number,
  outputTokens: number,
  extra: Record<string, unknown> = {},
) {
  const id = uuidv7();
  return {
    idempotencyKey: id,
    usageEventId: id,
    occurredAt: INSIDE,
    provider: 'anthropic',
    providerClient: { name: '@anthropic-ai/sdk' },
    requestedModel: 'claude-sonnet-5-5',
    respondedModel: 'claude-sonnet-5-5',
    operation: 'chat',
    status: 'success',
    usageStatus: 'reported',
    rawUsage: { input_tokens: inputTokens, output_tokens: outputTokens },
    ...(customerId === null ? {} : { customerId }),
    ...extra,
  };
}

async function ingest(apiKey: string, events: unknown[]): Promise<void> {
  for (let i = 0; i < events.length; i += 100) {
    const response = await fetch(`${app.url}/v1/usage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        sdk: { name: '@ai-unit-economics/sdk', version: '0.0.0' },
        events: events.slice(i, i + 100),
      }),
    });
    expect(response.status).toBe(200);
  }
  await app.derivation.deriveAll();
}

function summary(key: string, params: Record<string, string>) {
  return fetch(`${app.url}/v1/costs/summary?${new URLSearchParams(params)}`, {
    headers: { authorization: `Bearer ${key}` },
  });
}

async function summaryBody(key: string, params: Record<string, string>) {
  const response = await summary(key, params);
  expect(response.status).toBe(200);
  return costSummaryResponseSchema.parse(await response.json());
}

describe('GET /v1/costs/summary', () => {
  it('sums priced cost per customer, counts what it could not price, and never zeroes unknowns', async () => {
    const project = await app.createProject();
    await ingest(project.apiKey, [
      event('cust_a', 50_000, 0), //  50000 × $2/M = 0.1
      event('cust_a', 100_000, 0), // 100000 × $2/M = 0.2   → cust_a 0.3, exactly
      event('cust_a', 10, 10, { respondedModel: 'claude-unknown-9' }), // unpriced
      event('cust_b', 1000, 500), // 0.002 + 0.005 = 0.007
      event('cust_c', 10, 10, { respondedModel: 'claude-unknown-9' }), // only unpriced
      event(null, 1000, 500), // 0.007, no customer
    ]);

    const body = await summaryBody(project.readKey, { groupBy: 'customer', from: FROM, to: TO });

    expect(body.truncated).toBe(false);
    expect(body.groups).toEqual([
      { key: 'cust_a', currency: 'USD', amount: '0.3', pricedEvents: 2, leftOutEvents: 1 },
      { key: null, currency: 'USD', amount: '0.007', pricedEvents: 1, leftOutEvents: 0 },
      { key: 'cust_b', currency: 'USD', amount: '0.007', pricedEvents: 1, leftOutEvents: 0 },
      { key: 'cust_c', currency: 'USD', amount: null, pricedEvents: 0, leftOutEvents: 1 },
    ]);
  });

  it('groups by feature the same way', async () => {
    const project = await app.createProject();
    await ingest(project.apiKey, [
      event('cust_a', 1000, 500, { feature: 'summary' }), // 0.007
      event('cust_b', 1000, 500, { feature: 'summary' }), // 0.007
      event('cust_a', 50_000, 0, { feature: 'search' }), // 0.1
    ]);

    const body = await summaryBody(project.readKey, { groupBy: 'feature', from: FROM, to: TO });

    expect(body.groups.map((g) => [g.key, g.amount, g.pricedEvents])).toEqual([
      ['search', '0.1', 1],
      ['summary', '0.014', 2],
    ]);
  });

  it('counts only the current revision after a correction', async () => {
    const project = await app.createProject();
    await ingest(project.apiKey, [event('cust_a', 1000, 500)]); // 0.007
    const [original] = await app.costFacts.findAllByProjectId(project.id);
    await app.costFacts.insertCorrection(project.id, original!, { ...original!, amount: '0.005' });

    const body = await summaryBody(project.readKey, { groupBy: 'customer', from: FROM, to: TO });

    expect(body.groups).toEqual([
      { key: 'cust_a', currency: 'USD', amount: '0.005', pricedEvents: 1, leftOutEvents: 0 },
    ]);
  });

  it('includes from and excludes to', async () => {
    const project = await app.createProject();
    await ingest(project.apiKey, [
      event('at_from', 1000, 500, { occurredAt: FROM }),
      event('before_to', 1000, 500, { occurredAt: '2026-10-04T23:59:59.999Z' }),
      event('at_to', 1000, 500, { occurredAt: TO }),
    ]);

    const body = await summaryBody(project.readKey, { groupBy: 'customer', from: FROM, to: TO });

    expect(body.groups.map((g) => g.key).sort()).toEqual(['at_from', 'before_to']);
  });

  it('sees only its own project', async () => {
    const a = await app.createProject();
    const b = await app.createProject();
    await ingest(a.apiKey, [event('cust_a', 1000, 500)]);

    const body = await summaryBody(b.readKey, { groupBy: 'customer', from: FROM, to: TO });

    expect(body.groups).toEqual([]);
  });

  it('caps the groups and says so', async () => {
    const project = await app.createProject();
    await ingest(
      project.apiKey,
      Array.from({ length: 501 }, (_, i) => event(`cust_${String(i).padStart(3, '0')}`, 1000, 0)),
    );

    const body = await summaryBody(project.readKey, { groupBy: 'customer', from: FROM, to: TO });

    expect(body.groups).toHaveLength(500);
    expect(body.truncated).toBe(true);
  }, 30_000);

  it.each([
    ['no from', { groupBy: 'customer', to: TO }],
    ['a reversed range', { groupBy: 'customer', from: TO, to: FROM }],
    ['an unknown grouping', { groupBy: 'model', from: FROM, to: TO }],
  ])('answers 400 for %s', async (_, params) => {
    const project = await app.createProject();
    expect((await summary(project.readKey, params)).status).toBe(400);
  });
});

describe('keys do not stand in for each other', () => {
  const params = { groupBy: 'customer', from: FROM, to: TO };

  it('the SDK ingestion key cannot read costs', async () => {
    const project = await app.createProject();
    expect((await summary(project.apiKey, params)).status).toBe(401);
  });

  it('the read key cannot ingest', async () => {
    const project = await app.createProject();
    const response = await fetch(`${app.url}/v1/usage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${project.readKey}` },
      body: JSON.stringify({ sdk: { name: 'x', version: '0' }, events: [event('cust_a', 1, 1)] }),
    });
    expect(response.status).toBe(401);
  });

  it('no key cannot read', async () => {
    const response = await fetch(`${app.url}/v1/costs/summary?${new URLSearchParams(params)}`);
    expect(response.status).toBe(401);
  });
});

describe('GET /v1/costs/overview', () => {
  // Wide enough to include an event from before the price list (2026-10-03T10:52Z).
  const range = { from: '2026-10-01T00:00:00.000Z', to: '2026-10-05T00:00:00.000Z' };

  async function overview(key: string, params: Record<string, string> = range) {
    return fetch(`${app.url}/v1/costs/overview?${new URLSearchParams(params)}`, {
      headers: { authorization: `Bearer ${key}` },
    });
  }

  it('reports what the cost covers and, separately, each kind of gap', async () => {
    const project = await app.createProject();
    await ingest(project.apiKey, [
      event('cust_a', 50_000, 0), //  0.1
      event('cust_a', 1000, 500), //  0.007, corrected to 0.005 below
      event(null, 1000, 500), //  0.007, no customer
      event(null, 100, 50, { respondedModel: 'claude-unknown-9' }), // not priced, 150 tokens
      event('cust_b', 2000, 1000, {
        rawUsage: { input_tokens: 2000, output_tokens: 1000, inference_geo: 'us' },
      }), // not priced, 3000 tokens
      event('cust_b', 400, 100, { occurredAt: '2026-10-02T12:00:00.000Z' }), // before prices, 500
      event('cust_c', 1, 1, { rawUsage: { input_tokens: 1, output_tokens: 1, odd: 1 } }), // unreadable
      event('cust_c', 0, 0, { usageStatus: 'not_reported', rawUsage: undefined }), // a stream
    ]);
    const facts = await app.costFacts.findAllByProjectId(project.id);
    const toCorrect = facts.find(
      (f) => f.amount === '0.007000000000' && f.customerId === 'cust_a',
    )!;
    await app.costFacts.insertCorrection(project.id, toCorrect, { ...toCorrect, amount: '0.005' });

    const response = await overview(project.readKey);
    expect(response.status).toBe(200);
    const body = costOverviewResponseSchema.parse(await response.json());

    expect(body).toEqual({
      ...range,
      // 0.1 + 0.005 (current revision only) + 0.007
      priced: [{ currency: 'USD', amount: '0.112', events: 3 }],
      unattributed: { events: 2, priced: [{ currency: 'USD', amount: '0.007', events: 1 }] },
      notPriced: {
        events: 4,
        knownTokens: '3650', // 150 + 3000 + 500; the unreadable one has no count
        byReason: {
          UNKNOWN_MODEL: { events: 1, tokens: '150' },
          MISSING_PRICE_COMPONENT: { events: 1, tokens: '3000' },
          NO_RATE_FOR_PERIOD: { events: 1, tokens: '500' },
          USAGE_UNRECOGNIZED: { events: 1, tokens: null },
        },
      },
      notMeasured: { events: 1 },
    });
  });

  it('shows an empty range as zeros and no priced total, not as a $0 total', async () => {
    const project = await app.createProject();
    const body = costOverviewResponseSchema.parse(await (await overview(project.readKey)).json());
    expect(body.priced).toEqual([]);
    expect(body.notPriced.events).toBe(0);
    expect(body.notPriced.knownTokens).toBe('0');
    expect(body.notMeasured.events).toBe(0);
  });

  it('requires the read key and an explicit range', async () => {
    const project = await app.createProject();
    expect((await overview(project.apiKey)).status).toBe(401);
    expect((await overview(project.readKey, { from: range.from })).status).toBe(400);
  });
});
