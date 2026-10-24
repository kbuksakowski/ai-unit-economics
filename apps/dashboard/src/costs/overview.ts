import type {
  CostOverviewResponse,
  NotPricedStatus,
  PricedTotal,
} from '@ai-unit-economics/contracts';

import { formatAmount } from './format';

const REASON_LABEL: Record<NotPricedStatus, string> = {
  UNKNOWN_MODEL: 'unknown model',
  MISSING_PRICE_COMPONENT: 'missing price component',
  NO_RATE_FOR_PERIOD: 'before the price list',
  USAGE_UNRECOGNIZED: 'unreadable usage',
};

export function formatCount(value: string | number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** One amount per currency; never a $0 when nothing was priced (ADR-0010). */
export function formatPricedTotals(totals: PricedTotal[]): string {
  return totals.length
    ? totals.map((t) => formatAmount(t.amount, t.currency)).join(' + ')
    : 'nothing priced';
}

export function countPricedEvents(totals: PricedTotal[]): number {
  return totals.reduce((sum, t) => sum + t.events, 0);
}

/** Tokens of unpriced usage, the size of the gap without a guessed amount. */
export function describeNotPricedTokens(notPriced: CostOverviewResponse['notPriced']): string {
  const tokens = `${formatCount(notPriced.knownTokens)} tokens`;
  // Unreadable usage has no count, so the known figure is a floor.
  return notPriced.byReason.USAGE_UNRECOGNIZED.events > 0 ? `at least ${tokens}` : tokens;
}

export function describeNotPricedReasons(notPriced: CostOverviewResponse['notPriced']): string {
  const parts = (Object.keys(REASON_LABEL) as NotPricedStatus[])
    .filter((status) => notPriced.byReason[status].events > 0)
    .map((status) => `${REASON_LABEL[status]} ${notPriced.byReason[status].events}`);
  return parts.join(' · ');
}
