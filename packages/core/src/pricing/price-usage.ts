import { Money } from '../money.js';
import { USAGE_DETAIL, type NormalizedUsage } from '../usage/normalized-usage.js';
import type { RateRow, TokenRateSet } from './rate-table.js';

/**
 * `NOT_MEASURED` and `USAGE_UNRECOGNIZED` are set by the caller when there is no normalised
 * usage to price; this function returns the other four. Never zero for "unknown" (ADR-0009).
 */
export type CostStatus =
  | 'PRICED'
  | 'UNKNOWN_MODEL'
  | 'NO_RATE_FOR_PERIOD'
  | 'MISSING_PRICE_COMPONENT'
  | 'NOT_MEASURED'
  | 'USAGE_UNRECOGNIZED';

export interface CostResult {
  status: CostStatus;
  /** Null unless every component was priced: a partial sum would read as complete. */
  amount: Money | null;
  /** Cost of each priced bucket, kept even when the total is withheld. */
  details: Record<string, Money>;
  missingComponents: string[];
  rateValidFrom: string | null;
}

export interface PriceUsageInput {
  usage: NormalizedUsage;
  /** Pricing uses the model that answered, never the one requested (ADR-0006). */
  respondedModel: string | null;
  occurredAt: Date;
  rates: readonly RateRow[];
}

const TOKENS_PER_RATE_UNIT = 1_000_000n;

/**
 * Values that mean standard pricing. `not_available` is what a model without region choice
 * returns (seen on Haiku 4.5, 2026-10-03); such models always bill at standard rates per the
 * official price list. Any other value, `us` included, stays unpriced until it has a rate (ADR-0009).
 */
const STANDARD_INFERENCE_GEO = new Set([null, 'global', 'not_available']);

export function priceUsage({
  usage,
  respondedModel,
  occurredAt,
  rates,
}: PriceUsageInput): CostResult {
  const rows = respondedModel ? rates.filter((r) => r.model === respondedModel) : [];
  if (rows.length === 0) return withoutAmount('UNKNOWN_MODEL');

  const row = rows
    .filter((r) => Date.parse(r.validFrom) <= occurredAt.getTime())
    .sort((a, b) => Date.parse(a.validFrom) - Date.parse(b.validFrom))
    .at(-1);
  if (!row) return withoutAmount('NO_RATE_FOR_PERIOD');

  const missing: string[] = [];
  const rateSet = selectRateSet(row, usage, missing);
  const details: Record<string, Money> = {};

  if (rateSet) {
    const bill = (bucket: string, tokens: bigint, rate: string | null): void => {
      if (tokens === 0n) return;
      if (rate === null) missing.push(bucket);
      else details[bucket] = costOf(rate, tokens, row.currency);
    };
    bill('input', usage.details[USAGE_DETAIL.freshInput] ?? 0n, rateSet.input);
    bill('output', usage.outputTokens, rateSet.output);
    bill('cache_read', usage.cachedInputTokens, rateSet.cacheRead);
    bill('cache_write_5m', usage.details[USAGE_DETAIL.cacheWrite5m] ?? 0n, rateSet.cacheWrite5m);
    bill('cache_write_1h', usage.details[USAGE_DETAIL.cacheWrite1h] ?? 0n, rateSet.cacheWrite1h);
  }

  if (usage.details[USAGE_DETAIL.cacheWriteUnknownTtl]) missing.push('cache_write_unknown_ttl');
  // Billed per search; the rate is not in the price table yet.
  if (usage.details[USAGE_DETAIL.webSearchRequests]) missing.push('web_search');
  // Billed by container time, which usage does not report.
  if (usage.details[USAGE_DETAIL.codeExecutionRequests]) missing.push('code_execution_time');

  const status = missing.length ? 'MISSING_PRICE_COMPONENT' : 'PRICED';
  const amount =
    status === 'PRICED'
      ? Object.values(details).reduce((sum, part) => sum.add(part), Money.zero(row.currency))
      : null;
  return { status, amount, details, missingComponents: missing, rateValidFrom: row.validFrom };
}

/** Variants the table cannot price are reported as missing, never priced at standard. */
function selectRateSet(
  row: RateRow,
  usage: NormalizedUsage,
  missing: string[],
): TokenRateSet | null {
  if (!STANDARD_INFERENCE_GEO.has(usage.inferenceGeo)) {
    missing.push(`inference_geo:${usage.inferenceGeo}`);
  }
  // Allowlisted like geo and speed: a new tier may cost more or less than standard.
  if (usage.serviceTier !== null && !['standard', 'batch'].includes(usage.serviceTier)) {
    missing.push(`service_tier:${usage.serviceTier}`);
  }
  // Fast mode has its own rates, not in the price table yet: unpriced rather than priced low.
  if (usage.speed !== null && usage.speed !== 'standard') missing.push(`speed:${usage.speed}`);

  const batch = usage.serviceTier === 'batch';
  const tier =
    row.longContext && usage.inputTokens > BigInt(row.longContext.aboveInputTokens)
      ? row.longContext
      : row;
  const rateSet = batch ? tier.batch : tier.standard;
  if (!rateSet) missing.push(batch ? 'batch_rates' : 'standard_rates');
  return rateSet;
}

/** Exact: the rate's scale plus six digits holds any per-million product without rounding. */
function costOf(ratePerMillion: string, tokens: bigint, currency: string): Money {
  const scale = (ratePerMillion.split('.')[1] ?? '').length + 6;
  return Money.of(ratePerMillion, currency)
    .multiplyByCount(tokens)
    .divideByCount(TOKENS_PER_RATE_UNIT, scale);
}

function withoutAmount(status: CostStatus): CostResult {
  return { status, amount: null, details: {}, missingComponents: [], rateValidFrom: null };
}
