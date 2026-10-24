import { describe, expect, it } from 'vitest';

import { MAX_BUSINESS_ID_LENGTH } from './limits.js';
import { usageEventSchema } from './usage-event.js';

const validEvent = {
  idempotencyKey: '0199a5b0-1c2d-7000-8000-000000000001',
  usageEventId: '0199a5b0-1c2d-7000-8000-000000000001',
  occurredAt: '2026-09-08T09:14:00.123Z',
  provider: 'anthropic',
  providerClient: { name: '@anthropic-ai/sdk', version: '0.68.0' },
  requestedModel: 'claude-sonnet-5',
  respondedModel: 'claude-sonnet-5',
  operation: 'chat',
  customerId: 'customer_8472',
  feature: 'invoice-parser',
  status: 'success',
  usageStatus: 'reported',
  rawUsage: { input_tokens: 12_500, output_tokens: 1800, cache_read_input_tokens: 400 },
};

describe('usage event', () => {
  it('accepts a complete event', () => {
    expect(usageEventSchema.safeParse(validEvent).success).toBe(true);
  });

  it('carries the provider usage object through untouched', () => {
    const parsed = usageEventSchema.parse(validEvent);
    expect(parsed.rawUsage).toEqual(validEvent.rawUsage);
  });

  it('has nowhere to put a prompt or a completion', () => {
    const parsed = usageEventSchema.parse({
      ...validEvent,
      prompt: 'this must not survive',
      completion: 'nor this',
    });
    expect(parsed).not.toHaveProperty('prompt');
    expect(parsed).not.toHaveProperty('completion');
  });
});

describe('business attribution', () => {
  it('accepts an event with no customer, because that is still real cost', () => {
    const { customerId, feature, ...withoutAttribution } = validEvent;
    expect(usageEventSchema.safeParse(withoutAttribution).success).toBe(true);
  });

  it('rejects a customer id longer than the shared limit', () => {
    const result = usageEventSchema.safeParse({
      ...validEvent,
      customerId: 'x'.repeat(MAX_BUSINESS_ID_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty customer id, which is not the same as absent', () => {
    expect(usageEventSchema.safeParse({ ...validEvent, customerId: '' }).success).toBe(false);
  });
});

describe('call status and usage status vary independently', () => {
  it('accepts a failed call that still reported usage', () => {
    const result = usageEventSchema.safeParse({
      ...validEvent,
      status: 'error',
      errorType: 'overloaded_error',
      usageStatus: 'reported',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a failed call with nothing to measure', () => {
    const { rawUsage, ...withoutUsage } = validEvent;
    const result = usageEventSchema.safeParse({
      ...withoutUsage,
      status: 'error',
      errorType: 'connection_error',
      usageStatus: 'not_reported',
    });
    expect(result.success).toBe(true);
  });

  it('refuses to claim usage was reported without providing it', () => {
    const { rawUsage, ...withoutUsage } = validEvent;
    const result = usageEventSchema.safeParse({ ...withoutUsage, usageStatus: 'reported' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['rawUsage']);
  });
});

describe('identity', () => {
  it('rejects a UUIDv4, because v7 ordering is what keeps the index from fragmenting', () => {
    const result = usageEventSchema.safeParse({
      ...validEvent,
      idempotencyKey: 'ac0e2b4a-0000-4000-8000-000000000000',
    });
    expect(result.success).toBe(false);
  });

  it('allows the two identifiers to differ, so an event can be corrected later', () => {
    const result = usageEventSchema.safeParse({
      ...validEvent,
      usageEventId: '0199a5b0-1c2d-7000-8000-00000000000f',
    });
    expect(result.success).toBe(true);
  });
});

describe('timestamps', () => {
  it('requires UTC', () => {
    expect(
      usageEventSchema.safeParse({ ...validEvent, occurredAt: '2026-09-08T09:14:00+02:00' })
        .success,
    ).toBe(false);
  });

  it('rejects a date without a time', () => {
    expect(usageEventSchema.safeParse({ ...validEvent, occurredAt: '2026-09-08' }).success).toBe(
      false,
    );
  });
});

describe('provider client', () => {
  it('requires a name, since a bare version number identifies nothing', () => {
    const result = usageEventSchema.safeParse({
      ...validEvent,
      providerClient: { version: '0.68.0' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts a client that does not report its version', () => {
    const result = usageEventSchema.safeParse({
      ...validEvent,
      providerClient: { name: 'community-anthropic-client' },
    });
    expect(result.success).toBe(true);
  });
});
