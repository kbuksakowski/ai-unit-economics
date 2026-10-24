import { describe, expect, it } from 'vitest';

import { ingestEnvelopeSchema, ingestResponseSchema } from './envelope.js';
import { MAX_EVENTS_PER_BATCH } from './limits.js';

const event = {
  idempotencyKey: '0199a5b0-1c2d-7000-8000-000000000001',
  usageEventId: '0199a5b0-1c2d-7000-8000-000000000001',
  occurredAt: '2026-09-08T09:14:00.123Z',
  provider: 'anthropic',
  providerClient: { name: '@anthropic-ai/sdk', version: '0.68.0' },
  requestedModel: 'claude-sonnet-5',
  operation: 'chat',
  status: 'success',
  usageStatus: 'reported',
  rawUsage: { input_tokens: 10, output_tokens: 2 },
};

const envelope = {
  sdk: { name: '@ai-unit-economics/sdk', version: '0.1.0' },
  events: [event],
};

describe('envelope', () => {
  it('accepts a batch carrying a single event', () => {
    expect(ingestEnvelopeSchema.safeParse(envelope).success).toBe(true);
  });

  it('rejects an empty batch, which says nothing and costs a round trip', () => {
    expect(ingestEnvelopeSchema.safeParse({ ...envelope, events: [] }).success).toBe(false);
  });

  it('accepts a batch at the shared limit', () => {
    const events = Array.from({ length: MAX_EVENTS_PER_BATCH }, (_, index) => ({
      ...event,
      idempotencyKey: `0199a5b0-1c2d-7000-8000-${String(index).padStart(12, '0')}`,
    }));
    expect(ingestEnvelopeSchema.safeParse({ ...envelope, events }).success).toBe(true);
  });

  it('rejects a batch over the shared limit', () => {
    const events = Array.from({ length: MAX_EVENTS_PER_BATCH + 1 }, () => event);
    expect(ingestEnvelopeSchema.safeParse({ ...envelope, events }).success).toBe(false);
  });

  it('strips unknown top-level fields so a newer SDK works against an older server', () => {
    const parsed = ingestEnvelopeSchema.parse({ ...envelope, futureField: 'from a later SDK' });
    expect(parsed).not.toHaveProperty('futureField');
    expect(parsed.events).toHaveLength(1);
  });

  it('identifies our SDK separately from the provider client', () => {
    const parsed = ingestEnvelopeSchema.parse(envelope);
    expect(parsed.sdk.name).toBe('@ai-unit-economics/sdk');
    expect(parsed.events[0]?.providerClient.name).toBe('@anthropic-ai/sdk');
  });
});

describe('ingestion response', () => {
  it('reports a duplicate as accepted rather than as an error', () => {
    const result = ingestResponseSchema.safeParse({
      successes: [{ idempotencyKey: event.idempotencyKey, status: 200 }],
      errors: [],
    });
    expect(result.success).toBe(true);
  });

  it('allows an error with no key, for an event too malformed to read', () => {
    const result = ingestResponseSchema.safeParse({
      successes: [],
      errors: [{ code: 'invalid_event', message: 'idempotencyKey is not a UUIDv7' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a response where every event failed', () => {
    const result = ingestResponseSchema.safeParse({
      successes: [],
      errors: [{ idempotencyKey: event.idempotencyKey, code: 'invalid_event', message: 'nope' }],
    });
    expect(result.success).toBe(true);
  });
});
