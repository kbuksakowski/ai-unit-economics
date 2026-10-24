import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { toPerMillionTokens } from '../decimal.util.js';
import type { PricingRate, TokenRates } from '../pricing-rate.type.js';
import { computePricingVersion } from '../pricing-version.util.js';
import { ANTHROPIC_PRICING_VERSION, ANTHROPIC_RATES } from './anthropic.rates.js';

const snapshot = JSON.parse(
  readFileSync(new URL('../../snapshot/litellm-anthropic.json', import.meta.url), 'utf8'),
) as { upstream: { sha: string }; entries: Record<string, Record<string, unknown>> };

const DECIMAL = /^(0|[1-9]\d*)(\.\d*[1-9])?$/;

/** Decimal string to an integer count of millionths, for exact comparison in tests. */
function micros(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * 1_000_000n + BigInt(fraction.padEnd(6, '0').slice(0, 6));
}

function rateStrings(rates: TokenRates | null): string[] {
  return rates ? Object.values(rates).filter((v): v is string => v !== null) : [];
}

function latest(model: string): PricingRate {
  const row = ANTHROPIC_RATES.filter((r) => r.model === model).at(-1);
  if (!row) throw new Error(`no rate for ${model}`);
  return row;
}

describe('the Anthropic rate table', () => {
  it('names a version whose hash matches its content', () => {
    expect(computePricingVersion('anthropic', ANTHROPIC_RATES)).toBe(ANTHROPIC_PRICING_VERSION);
  });

  it('holds only exact decimal strings, never floats', () => {
    for (const row of ANTHROPIC_RATES) {
      const all = [
        ...rateStrings(row.standard),
        ...rateStrings(row.batch),
        ...rateStrings(row.longContext?.standard ?? null),
        ...rateStrings(row.longContext?.batch ?? null),
      ];
      for (const value of all) expect(value, row.model).toMatch(DECIMAL);
    }
  });

  it('appends: validFrom strictly increases per model', () => {
    const byModel = Map.groupBy(ANTHROPIC_RATES, (r) => r.model);
    for (const [model, rows] of byModel) {
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i]!.validFrom > rows[i - 1]!.validFrom, model).toBe(true);
      }
    }
  });

  it('carries provenance; EXACT needs a date, OBSERVED is never valid before it was seen', () => {
    for (const row of ANTHROPIC_RATES) {
      expect(row.provenance.source, row.model).toMatch(/^https:\/\//);
      if (row.provenance.confidence === 'EXACT') {
        expect(row.provenance.effectiveAt, row.model).not.toBeNull();
      } else {
        expect(row.validFrom >= row.provenance.observedAt, row.model).toBe(true);
      }
    }
  });

  it('covers every Anthropic model in the vendored snapshot, with its rates', () => {
    for (const [model, entry] of Object.entries(snapshot.entries)) {
      const row = latest(model);
      expect(row.provenance.snapshotSha).toBe(snapshot.upstream.sha);
      expect(row.standard.input).toBe(toPerMillionTokens(entry.input_cost_per_token as number));
      expect(row.standard.output).toBe(toPerMillionTokens(entry.output_cost_per_token as number));
    }
  });

  it('prices batch at half the standard rate wherever both are known', () => {
    for (const row of ANTHROPIC_RATES) {
      if (!row.batch) continue;
      expect(micros(row.batch.input) * 2n, row.model).toBe(micros(row.standard.input));
      expect(micros(row.batch.output) * 2n, row.model).toBe(micros(row.standard.output));
    }
  });
});

/**
 * Copied by hand from https://platform.claude.com/docs/en/about-claude/pricing on 2026-10-03,
 * independently of the import, so an import bug cannot pass its own test.
 */
describe('agreement with the official Anthropic price list', () => {
  const official: Record<string, [string, string, string, string, string]> = {
    //                        input   output  cacheRead  write5m  write1h
    'claude-fable-5-1': ['10', '50', '0.25', '12.5', '20'],
    'claude-opus-5-5': ['4', '20', '0.2', '5', '8'],
    'claude-opus-4-7': ['5', '25', '0.5', '6.25', '10'],
    'claude-sonnet-5-5': ['2', '10', '0.2', '2.5', '4'],
    'claude-sonnet-5': ['2', '10', '0.2', '2.5', '4'],
    'claude-sonnet-4-6': ['3', '15', '0.3', '3.75', '6'],
    'claude-haiku-4-5-20251001': ['1', '5', '0.1', '1.25', '2'],
  };

  it.each(Object.entries(official))('%s', (model, [input, output, cacheRead, write5m, write1h]) => {
    expect(latest(model).standard).toEqual({
      input,
      output,
      cacheRead,
      cacheWrite5m: write5m,
      cacheWrite1h: write1h,
    });
  });

  it('keeps the non-standard cache-read multipliers of the newest models', () => {
    // 0.05x on Opus 5.5 and 0.025x on Fable 5.1, not the usual 0.1x.
    const ratio = (model: string) => {
      const { input, cacheRead } = latest(model).standard;
      return Number((micros(cacheRead!) * 1000n) / micros(input)) / 1000;
    };
    expect(ratio('claude-opus-5-5')).toBe(0.05);
    expect(ratio('claude-fable-5-1')).toBe(0.025);
    expect(ratio('claude-sonnet-5-5')).toBe(0.1);
  });
});
