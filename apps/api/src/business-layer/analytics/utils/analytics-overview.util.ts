import type {
  CostOverviewResponse,
  NotPricedReason,
  NotPricedStatus,
  PricedTotal,
} from '@ai-unit-economics/contracts';
import { Money } from '@ai-unit-economics/core';

import type { CostFactTotalsRow } from '../../../data-access-layer/cost-fact-entity/types/cost-fact.type.js';
import { canonicalDecimal } from '../../../utils/decimal.util.js';

const NOT_PRICED_STATUSES: readonly NotPricedStatus[] = [
  'UNKNOWN_MODEL',
  'MISSING_PRICE_COMPONENT',
  'NO_RATE_FOR_PERIOD',
  'USAGE_UNRECOGNIZED',
];

/**
 * Folds status buckets into the overview. Amounts are added as `Money`, never as numbers,
 * and only within one currency (ADR-0010).
 */
export function mapCostFactTotalsToOverview(
  rows: CostFactTotalsRow[],
  range: { from: string; to: string },
): CostOverviewResponse {
  const priced = rows.filter((r) => r.status === 'PRICED');
  const unattributed = rows.filter((r) => r.attributionStatus === 'UNATTRIBUTED');

  const byReason = Object.fromEntries(
    NOT_PRICED_STATUSES.map((status) => [
      status,
      reasonOf(rows.filter((r) => r.status === status)),
    ]),
  ) as Record<NotPricedStatus, NotPricedReason>;
  const reasons = Object.values(byReason);

  return {
    ...range,
    priced: pricedTotals(priced),
    unattributed: {
      events: countEvents(unattributed),
      priced: pricedTotals(unattributed.filter((r) => r.status === 'PRICED')),
    },
    notPriced: {
      events: reasons.reduce((sum, r) => sum + r.events, 0),
      knownTokens: reasons.reduce((sum, r) => sum + BigInt(r.tokens ?? 0), 0n).toString(),
      byReason,
    },
    notMeasured: { events: countEvents(rows.filter((r) => r.status === 'NOT_MEASURED')) },
  };
}

function pricedTotals(rows: CostFactTotalsRow[]): PricedTotal[] {
  const byCurrency = new Map<string, { amount: Money; events: number }>();
  for (const row of rows) {
    const amount = Money.of(row.amount ?? '0', row.currency);
    const current = byCurrency.get(row.currency);
    byCurrency.set(row.currency, {
      amount: current ? current.amount.add(amount) : amount,
      events: (current?.events ?? 0) + Number(row.events),
    });
  }
  return [...byCurrency]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([currency, total]) => ({
      currency,
      amount: canonicalDecimal(total.amount.amount),
      events: total.events,
    }));
}

// Unreadable usage has no token count; null says "unknown", never "zero tokens".
function reasonOf(rows: CostFactTotalsRow[]): NotPricedReason {
  const events = countEvents(rows);
  const readable = rows.every((r) => r.tokens !== null);
  return {
    events,
    tokens:
      events > 0 && !readable
        ? null
        : rows.reduce((sum, r) => sum + BigInt(r.tokens ?? 0), 0n).toString(),
  };
}

function countEvents(rows: CostFactTotalsRow[]): number {
  return rows.reduce((sum, r) => sum + Number(r.events), 0);
}
