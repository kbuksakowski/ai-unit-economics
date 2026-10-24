import { describe, expect, it } from 'vitest';

import { Money } from '../money.js';
import { normalizeAnthropicUsage } from '../usage/anthropic-usage.js';
import type { NormalizedUsage } from '../usage/normalized-usage.js';
import { priceUsage } from './price-usage.js';
import type { RateRow } from './rate-table.js';

/**
 * Rates copied by hand from https://platform.claude.com/docs/en/about-claude/pricing
 * (2026-10-03), and expected amounts computed by hand in the comments — independently of
 * the engine and of pricing-data, so neither can pass its own test.
 */
const SINCE = '2026-10-03T00:00:00.000Z';
const RATES: RateRow[] = [
  {
    model: 'claude-sonnet-5-5',
    validFrom: SINCE,
    currency: 'USD',
    standard: {
      input: '2',
      output: '10',
      cacheRead: '0.2',
      cacheWrite5m: '2.5',
      cacheWrite1h: '4',
    },
    batch: { input: '1', output: '5', cacheRead: '0.1', cacheWrite5m: '1.25', cacheWrite1h: null },
    longContext: null,
  },
  {
    model: 'claude-sonnet-4-5',
    validFrom: SINCE,
    currency: 'USD',
    standard: {
      input: '3',
      output: '15',
      cacheRead: '0.3',
      cacheWrite5m: '3.75',
      cacheWrite1h: '6',
    },
    batch: null,
    longContext: {
      aboveInputTokens: 200_000,
      standard: {
        input: '6',
        output: '22.5',
        cacheRead: '0.6',
        cacheWrite5m: '7.5',
        cacheWrite1h: '12',
      },
      batch: null,
    },
  },
];

const AT = new Date('2026-10-04T12:00:00.000Z');

function usage(raw: Record<string, unknown>): NormalizedUsage {
  const result = normalizeAnthropicUsage(raw);
  if (result.status !== 'NORMALIZED') throw new Error(result.reason);
  return result.usage;
}

function price(
  raw: Record<string, unknown>,
  model: string | null = 'claude-sonnet-5-5',
  at = AT,
  rates = RATES,
) {
  return priceUsage({ usage: usage(raw), respondedModel: model, occurredAt: at, rates });
}

const usd = (amount: string) => Money.of(amount, 'USD');

describe('priceUsage', () => {
  it('prices plain input and output', () => {
    // 1000 × $2/M = 0.002; 500 × $10/M = 0.005; total 0.007
    const cost = price({ input_tokens: 1000, output_tokens: 500 });
    expect(cost.status).toBe('PRICED');
    expect(cost.amount!.equals(usd('0.007'))).toBe(true);
  });

  it('prices each cache bucket at its own rate', () => {
    // fresh 100 × 2 = 0.0002 · read 40000 × 0.2 = 0.008 · 5m 8000 × 2.5 = 0.02
    // 1h 2000 × 4 = 0.008 · output 300 × 10 = 0.003 · total 0.0392
    const cost = price({
      input_tokens: 100,
      output_tokens: 300,
      cache_read_input_tokens: 40_000,
      cache_creation_input_tokens: 10_000,
      cache_creation: { ephemeral_5m_input_tokens: 8_000, ephemeral_1h_input_tokens: 2_000 },
    });
    expect(cost.amount!.equals(usd('0.0392'))).toBe(true);
    expect(cost.details.cache_read!.equals(usd('0.008'))).toBe(true);
    expect(cost.details.cache_write_1h!.equals(usd('0.008'))).toBe(true);
  });

  it('is exact where floats are not', () => {
    // 3 × $0.2/M = 0.0000006 exactly; as floats 3 * 0.2 / 1e6 = 6.000000000000001e-7
    const cost = price({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 3 });
    expect(cost.amount!.amount).toBe('0.0000006');
  });

  it('uses batch rates for the batch tier', () => {
    // 1000 × $1/M = 0.001; 1000 × $5/M = 0.005; total 0.006
    const cost = price({ input_tokens: 1000, output_tokens: 1000, service_tier: 'batch' });
    expect(cost.amount!.equals(usd('0.006'))).toBe(true);
  });

  it('switches to long-context rates only above the threshold', () => {
    // 250000 × $6/M = 1.5; 1000 × $22.5/M = 0.0225; total 1.5225
    const above = price({ input_tokens: 250_000, output_tokens: 1000 }, 'claude-sonnet-4-5');
    expect(above.amount!.equals(usd('1.5225'))).toBe(true);
    // exactly 200000 is not above: 200000 × $3/M = 0.6
    const at = price({ input_tokens: 200_000, output_tokens: 0 }, 'claude-sonnet-4-5');
    expect(at.amount!.equals(usd('0.6'))).toBe(true);
  });

  it('counts cached input towards the long-context threshold', () => {
    // 1000 fresh + 199500 read = 200500 > 200000 → long-context rates:
    // 1000 × 6 = 0.006; 199500 × 0.6 = 0.1197; total 0.1257
    const cost = price(
      { input_tokens: 1000, output_tokens: 0, cache_read_input_tokens: 199_500 },
      'claude-sonnet-4-5',
    );
    expect(cost.amount!.equals(usd('0.1257'))).toBe(true);
  });

  it('withholds the total when a component has no rate, but keeps the parts it knows', () => {
    const cost = price({
      input_tokens: 1000,
      output_tokens: 0,
      service_tier: 'batch',
      cache_creation_input_tokens: 100,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 100 },
    });
    expect(cost.status).toBe('MISSING_PRICE_COMPONENT');
    expect(cost.amount).toBeNull();
    expect(cost.missingComponents).toEqual(['cache_write_1h']);
    expect(cost.details.input!.equals(usd('0.001'))).toBe(true);
  });

  it.each([
    ['US-only inference', { inference_geo: 'us' }, 'inference_geo:us'],
    ['priority tier', { service_tier: 'priority' }, 'service_tier:priority'],
    ['an unknown service tier', { service_tier: 'flex' }, 'service_tier:flex'],
    ['web search', { server_tool_use: { web_search_requests: 1 } }, 'web_search'],
    ['code execution', { server_tool_use: { code_execution_requests: 1 } }, 'code_execution_time'],
    ['a cache write of unknown TTL', { cache_creation_input_tokens: 5 }, 'cache_write_unknown_ttl'],
  ])('never prices %s at the standard rate', (_, extra, component) => {
    const cost = price({ input_tokens: 10, output_tokens: 10, ...extra });
    expect(cost.status).toBe('MISSING_PRICE_COMPONENT');
    expect(cost.amount).toBeNull();
    expect(cost.missingComponents).toContain(component);
  });

  it('prices the real Anthropic response of 2026-10-24, which added speed', () => {
    // A real Haiku 4.5 response of 2026-10-24: usage exactly as returned.
    const real = {
      input_tokens: 14,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
      output_tokens: 4,
      service_tier: 'standard',
      inference_geo: 'not_available',
      speed: 'standard',
    };
    const haiku: RateRow[] = [
      {
        model: 'claude-haiku-4-5-20251001',
        validFrom: SINCE,
        currency: 'USD',
        standard: {
          input: '1',
          output: '5',
          cacheRead: '0.1',
          cacheWrite5m: '1.25',
          cacheWrite1h: '2',
        },
        batch: null,
        longContext: null,
      },
    ];
    // 14 × $1/M + 4 × $5/M = 0.000034
    const cost = price(real, 'claude-haiku-4-5-20251001', AT, haiku);
    expect(cost.status).toBe('PRICED');
    expect(cost.amount!.equals(usd('0.000034'))).toBe(true);
  });

  it('prices the richest real shape: Opus 5.5 with output details, global and speed', () => {
    // A real Opus 5.5 response of 2026-10-24: usage exactly as returned.
    const real = {
      input_tokens: 18,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
      output_tokens: 5,
      output_tokens_details: { thinking_tokens: 0 },
      service_tier: 'standard',
      inference_geo: 'global',
      speed: 'standard',
    };
    const opus: RateRow[] = [
      {
        model: 'claude-opus-5-5',
        validFrom: SINCE,
        currency: 'USD',
        standard: {
          input: '4',
          output: '20',
          cacheRead: '0.2',
          cacheWrite5m: '5',
          cacheWrite1h: '8',
        },
        batch: null,
        longContext: null,
      },
    ];
    // 18 × $4/M + 5 × $20/M = 0.000072 + 0.0001 = 0.000172
    const cost = price(real, 'claude-opus-5-5', AT, opus);
    expect(cost.status).toBe('PRICED');
    expect(cost.amount!.equals(usd('0.000172'))).toBe(true);
  });

  it('never prices fast mode at the standard rate', () => {
    const cost = price({ input_tokens: 10, output_tokens: 10, speed: 'fast' });
    expect(cost).toMatchObject({ status: 'MISSING_PRICE_COMPONENT', amount: null });
    expect(cost.missingComponents).toEqual(['speed:fast']);
  });

  it.each(['global', 'not_available'])('treats inference_geo "%s" as standard', (geo) => {
    expect(price({ input_tokens: 10, output_tokens: 10, inference_geo: geo }).status).toBe(
      'PRICED',
    );
  });

  it('prices the first real Anthropic response (Haiku 4.5, 2026-10-03)', () => {
    // A real Haiku 4.5 response of 2026-10-03: usage only, no content, no secrets.
    const real = {
      input_tokens: 14,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
      output_tokens: 4,
      service_tier: 'standard',
      inference_geo: 'not_available',
    };
    const haiku: RateRow[] = [
      {
        model: 'claude-haiku-4-5-20251001',
        validFrom: SINCE,
        currency: 'USD',
        standard: {
          input: '1',
          output: '5',
          cacheRead: '0.1',
          cacheWrite5m: '1.25',
          cacheWrite1h: '2',
        },
        batch: null,
        longContext: null,
      },
    ];
    // 14 × $1/M + 4 × $5/M = 0.000014 + 0.00002 = 0.000034
    const cost = price(real, 'claude-haiku-4-5-20251001', AT, haiku);
    expect(cost.status).toBe('PRICED');
    expect(cost.amount!.equals(usd('0.000034'))).toBe(true);
  });

  it.each([
    ['a model not in the table', 'claude-unknown-9'],
    ['no responded model', null],
  ])('reports %s as UNKNOWN_MODEL, never zero', (_, model) => {
    const cost = price({ input_tokens: 10, output_tokens: 10 }, model);
    expect(cost).toMatchObject({ status: 'UNKNOWN_MODEL', amount: null });
  });

  it('reports an event older than the first rate as NO_RATE_FOR_PERIOD', () => {
    const cost = price(
      { input_tokens: 10, output_tokens: 10 },
      'claude-sonnet-5-5',
      new Date('2026-10-02T23:59:59.999Z'),
    );
    expect(cost).toMatchObject({ status: 'NO_RATE_FOR_PERIOD', amount: null });
  });

  describe('across a price change', () => {
    const CHANGE = '2026-11-01T00:00:00.000Z';
    const changed: RateRow[] = [
      ...RATES,
      { ...RATES[0]!, validFrom: CHANGE, standard: { ...RATES[0]!.standard, input: '1' } },
    ];
    const raw = { input_tokens: 1_000_000, output_tokens: 0 };

    it('prices the last instant before the change at the old rate', () => {
      const cost = price(raw, 'claude-sonnet-5-5', new Date('2026-10-31T23:59:59.999Z'), changed);
      expect(cost.amount!.equals(usd('2'))).toBe(true);
      expect(cost.rateValidFrom).toBe(SINCE);
    });

    it('prices the instant of the change at the new rate: intervals are half-open', () => {
      const cost = price(raw, 'claude-sonnet-5-5', new Date(CHANGE), changed);
      expect(cost.amount!.equals(usd('1'))).toBe(true);
      expect(cost.rateValidFrom).toBe(CHANGE);
    });
  });
});
