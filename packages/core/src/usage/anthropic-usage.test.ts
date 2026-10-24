import { describe, expect, it } from 'vitest';

import { normalizeAnthropicUsage } from './anthropic-usage.js';

function normalized(raw: unknown) {
  const result = normalizeAnthropicUsage(raw);
  if (result.status !== 'NORMALIZED') throw new Error(result.reason);
  return result.usage;
}

describe('normalizeAnthropicUsage', () => {
  it('adds cache tokens to input: they are disjoint from input_tokens at Anthropic', () => {
    const usage = normalized({
      input_tokens: 100,
      output_tokens: 300,
      cache_read_input_tokens: 40_000,
      cache_creation_input_tokens: 10_000,
      cache_creation: { ephemeral_5m_input_tokens: 8_000, ephemeral_1h_input_tokens: 2_000 },
    });
    expect(usage.inputTokens).toBe(50_100n);
    expect(usage.cachedInputTokens).toBe(40_000n);
    expect(usage.outputTokens).toBe(300n);
    expect(usage.details).toEqual({
      fresh_input: 100n,
      cache_write_5m: 8_000n,
      cache_write_1h: 2_000n,
    });
  });

  it('reads null cache fields as none, the provider’s documented meaning', () => {
    const usage = normalized({
      input_tokens: 12,
      output_tokens: 3,
      cache_read_input_tokens: null,
      cache_creation_input_tokens: null,
      cache_creation: null,
      server_tool_use: null,
      service_tier: 'standard',
      inference_geo: null,
    });
    expect(usage.inputTokens).toBe(12n);
    expect(usage.details).toEqual({ fresh_input: 12n });
    expect(usage.serviceTier).toBe('standard');
  });

  it('reads speed, added by Anthropic after the first release of this adapter', () => {
    expect(normalized({ input_tokens: 1, output_tokens: 1, speed: 'fast' }).speed).toBe('fast');
    expect(normalized({ input_tokens: 1, output_tokens: 1 }).speed).toBeNull();
  });

  it('keeps a cache write without its TTL split as such, not as a guessed 5-minute write', () => {
    const usage = normalized({
      input_tokens: 1,
      output_tokens: 1,
      cache_creation_input_tokens: 500,
    });
    expect(usage.details.cache_write_unknown_ttl).toBe(500n);
  });

  it('counts server tool requests', () => {
    const usage = normalized({
      input_tokens: 1,
      output_tokens: 1,
      server_tool_use: { web_search_requests: 2, web_fetch_requests: 0 },
    });
    expect(usage.details.web_search_requests).toBe(2n);
    expect(usage.details.web_fetch_requests).toBeUndefined();
  });

  it.each([
    [
      'an unknown key, possibly a new billable bucket',
      { input_tokens: 1, output_tokens: 1, iterations: [] },
    ],
    [
      'an unknown output detail, possibly a separately billed bucket',
      {
        input_tokens: 1,
        output_tokens: 1,
        output_tokens_details: { thinking_tokens: 0, audio_tokens: 3 },
      },
    ],
    [
      'an unknown server tool',
      { input_tokens: 1, output_tokens: 1, server_tool_use: { new_tool_requests: 1 } },
    ],
    [
      'a cache split that does not add up',
      {
        input_tokens: 1,
        output_tokens: 1,
        cache_creation_input_tokens: 10,
        cache_creation: { ephemeral_5m_input_tokens: 3, ephemeral_1h_input_tokens: 3 },
      },
    ],
    ['a negative count', { input_tokens: -1, output_tokens: 1 }],
    ['a fractional count', { input_tokens: 1.5, output_tokens: 1 }],
    ['missing output', { input_tokens: 1 }],
    ['not an object', 'usage'],
    ['null', null],
  ])('reports %s as unrecognised instead of guessing', (_, raw) => {
    expect(normalizeAnthropicUsage(raw).status).toBe('UNRECOGNIZED_SHAPE');
  });
});
