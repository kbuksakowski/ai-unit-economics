import { MAX_BODY_BYTES, ingestResponseSchema } from '@ai-unit-economics/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startTestApp, type TestApp } from '../../../test/app.js';

let app: TestApp;

beforeAll(async () => {
  app = await startTestApp();
});

afterAll(async () => {
  await app.close();
});

let counter = 0;
/** A distinct, valid UUIDv7 per call. */
function key(): string {
  counter++;
  return `0199a5b0-1c2d-7000-8000-${String(Date.now() % 1e6).padStart(6, '0')}${String(counter).padStart(6, '0')}`;
}

function event(overrides: Record<string, unknown> = {}) {
  const id = key();
  return {
    idempotencyKey: id,
    usageEventId: id,
    occurredAt: '2026-10-03T09:14:00.123Z',
    provider: 'anthropic',
    providerClient: { name: '@anthropic-ai/sdk', version: '0.124.0' },
    requestedModel: 'claude-sonnet-5',
    respondedModel: 'claude-sonnet-5-20260801',
    operation: 'chat',
    customerId: 'cust_42',
    status: 'success',
    usageStatus: 'reported',
    rawUsage: { input_tokens: 12, output_tokens: 3, cache_read_input_tokens: 40 },
    ...overrides,
  };
}

const SDK = { name: '@ai-unit-economics/sdk', version: '0.0.0' };

function post(body: unknown, apiKey: string | undefined, raw?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  return fetch(`${app.url}/v1/usage`, {
    method: 'POST',
    headers,
    body: raw ?? JSON.stringify(body),
  });
}

describe('POST /v1/usage', () => {
  it('stores an event exactly as delivered, with three timestamps', async () => {
    const project = await app.createProject();
    const sent = event({ feature: 'summary', durationMs: 812 });

    const response = await post({ sdk: SDK, events: [sent] }, project.apiKey);

    expect(response.status).toBe(200);
    const body = ingestResponseSchema.parse(await response.json());
    expect(body).toEqual({
      successes: [{ idempotencyKey: sent.idempotencyKey, status: 201 }],
      errors: [],
    });

    const [row] = await app.usageEvents.findAllByProjectId(project.id);
    expect(row).toMatchObject({
      idempotencyKey: sent.idempotencyKey,
      usageEventId: sent.usageEventId,
      requestedModel: 'claude-sonnet-5',
      respondedModel: 'claude-sonnet-5-20260801',
      providerClientVersion: '0.124.0',
      customerId: 'cust_42',
      feature: 'summary',
      durationMs: 812,
      usageStatus: 'reported',
      rawUsage: sent.rawUsage,
      sdkName: SDK.name,
      sdkVersion: SDK.version,
    });
    expect(row!.occurredAt.toISOString()).toBe(sent.occurredAt);
    expect(row!.receivedAt).toBeInstanceOf(Date);
    expect(row!.storedAt).toBeInstanceOf(Date);
  });

  it('stores a repeated idempotency key once and answers 200 for the repeat', async () => {
    const project = await app.createProject();
    const sent = event();

    await post({ sdk: SDK, events: [sent] }, project.apiKey);
    const retry = await post({ sdk: SDK, events: [sent] }, project.apiKey);

    expect(await retry.json()).toEqual({
      successes: [{ idempotencyKey: sent.idempotencyKey, status: 200 }],
      errors: [],
    });
    expect(await app.usageEvents.findAllByProjectId(project.id)).toHaveLength(1);
  });

  it('deduplicates within a single batch too', async () => {
    const project = await app.createProject();
    const sent = event();

    const response = await post({ sdk: SDK, events: [sent, sent] }, project.apiKey);

    expect((await response.json()).successes.map((s: { status: number }) => s.status)).toEqual([
      201, 200,
    ]);
    expect(await app.usageEvents.findAllByProjectId(project.id)).toHaveLength(1);
  });

  it('stores an event without a customer: unattributed usage is still cost', async () => {
    const project = await app.createProject();
    const { customerId: _, ...sent } = event();

    await post({ sdk: SDK, events: [sent] }, project.apiKey);

    const [row] = await app.usageEvents.findAllByProjectId(project.id);
    expect(row!.customerId).toBeNull();
  });

  it('keeps an invalid event with its reason, and still accepts the rest of the batch', async () => {
    const project = await app.createProject();
    const good = event();
    const bad = event({ usageStatus: 'reported', rawUsage: undefined });

    const response = await post({ sdk: SDK, events: [good, bad] }, project.apiKey);

    expect(response.status).toBe(200);
    const body = ingestResponseSchema.parse(await response.json());
    expect(body.successes).toEqual([{ idempotencyKey: good.idempotencyKey, status: 201 }]);
    expect(body.errors).toEqual([
      expect.objectContaining({ idempotencyKey: bad.idempotencyKey, code: 'invalid_event' }),
    ]);

    expect(await app.usageEvents.findAllByProjectId(project.id)).toHaveLength(1);
    const [rejected] = await app.rejectedEvents.findAllByProjectId(project.id);
    expect(rejected).toMatchObject({ idempotencyKey: bad.idempotencyKey, sdkName: SDK.name });
    expect(rejected!.payload).toMatchObject({ requestedModel: 'claude-sonnet-5' });
    expect(rejected!.issues).toEqual([expect.objectContaining({ path: ['rawUsage'] })]);
  });

  it('keeps an unreadable event without an idempotency key', async () => {
    const project = await app.createProject();

    const response = await post({ sdk: SDK, events: ['not an event'] }, project.apiKey);

    const body = ingestResponseSchema.parse(await response.json());
    expect(body.errors).toEqual([expect.objectContaining({ code: 'invalid_event' })]);
    expect(body.errors[0]!.idempotencyKey).toBeUndefined();
    const [rejected] = await app.rejectedEvents.findAllByProjectId(project.id);
    expect(rejected!.payload).toBe('not an event');
  });

  it.each([
    ['a null event', null],
    [
      'an event nested too deeply to store',
      { nested: JSON.parse('['.repeat(40) + ']'.repeat(40)) },
    ],
  ])('keeps %s as rejected and still stores its neighbours', async (_, bad) => {
    const project = await app.createProject();
    const first = event();
    const last = event();

    const response = await post({ sdk: SDK, events: [first, bad, last] }, project.apiKey);

    expect(response.status).toBe(200);
    const body = ingestResponseSchema.parse(await response.json());
    expect(body.successes.map((s) => s.idempotencyKey)).toEqual([
      first.idempotencyKey,
      last.idempotencyKey,
    ]);
    expect(body.errors).toEqual([expect.objectContaining({ code: 'invalid_event' })]);
    expect(await app.usageEvents.findAllByProjectId(project.id)).toHaveLength(2);
    const [rejected] = await app.rejectedEvents.findAllByProjectId(project.id);
    expect(rejected!.payload).toBeNull();
  });

  it('ignores unknown fields instead of rejecting them', async () => {
    const project = await app.createProject();

    const response = await post(
      { sdk: SDK, events: [event({ fromTheFuture: true })], alsoNew: 1 },
      project.apiKey,
    );

    expect((await response.json()).successes).toHaveLength(1);
  });

  it.each([
    ['no events', { sdk: SDK, events: [] }],
    ['no sdk identity', { events: [event()] }],
    ['events not an array', { sdk: SDK, events: {} }],
  ])('answers 400 for a malformed envelope: %s', async (_, body) => {
    const project = await app.createProject();
    const response = await post(body, project.apiKey);
    expect(response.status).toBe(400);
    expect(await app.rejectedEvents.findAllByProjectId(project.id)).toHaveLength(0);
  });

  it('answers 400 for a body that is not JSON', async () => {
    const project = await app.createProject();
    expect((await post(undefined, project.apiKey, '{nope')).status).toBe(400);
  });

  it('answers 413 above the shared body limit', async () => {
    const project = await app.createProject();
    const huge = JSON.stringify({ sdk: SDK, events: ['x'.repeat(MAX_BODY_BYTES)] });
    expect((await post(undefined, project.apiKey, huge)).status).toBe(413);
  });

  it.each([
    ['no key', undefined],
    ['an unknown key', 'aiue_live_doesnotexist'],
  ])('answers 401 with %s', async (_, apiKey) => {
    const response = await post({ sdk: SDK, events: [event()] }, apiKey);
    expect(response.status).toBe(401);
  });
});

describe('tenant isolation', () => {
  it('scopes deduplication and reads to the project', async () => {
    const a = await app.createProject();
    const b = await app.createProject();
    const shared = event();

    await post({ sdk: SDK, events: [shared] }, a.apiKey);
    const inB = await post({ sdk: SDK, events: [shared] }, b.apiKey);

    // The same key in another project is a different event, not a duplicate.
    expect((await inB.json()).successes[0].status).toBe(201);
    const rowsA = await app.usageEvents.findAllByProjectId(a.id);
    const rowsB = await app.usageEvents.findAllByProjectId(b.id);
    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(1);
    expect(rowsA[0]!.projectId).toBe(a.id);
    expect(rowsB[0]!.projectId).toBe(b.id);
  });
});
