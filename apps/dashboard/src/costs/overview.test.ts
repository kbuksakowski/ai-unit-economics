import type { CostOverviewResponse } from '@ai-unit-economics/contracts';
import { describe, expect, it } from 'vitest';

import {
  countPricedEvents,
  describeNotPricedReasons,
  describeNotPricedTokens,
  formatCount,
  formatPricedTotals,
} from './overview';

const reason = (events: number, tokens: string | null = '0') => ({ events, tokens });
const notPriced = (overrides: Partial<CostOverviewResponse['notPriced']['byReason']> = {}) => ({
  events: 0,
  knownTokens: '41250',
  byReason: {
    UNKNOWN_MODEL: reason(3, '20000'),
    MISSING_PRICE_COMPONENT: reason(2, '15000'),
    NO_RATE_FOR_PERIOD: reason(0),
    USAGE_UNRECOGNIZED: reason(0),
    ...overrides,
  },
});

describe('overview presentation', () => {
  it('shows each currency separately and says so when nothing was priced', () => {
    expect(formatPricedTotals([{ currency: 'USD', amount: '4.66', events: 291 }])).toBe('$4.66');
    expect(
      formatPricedTotals([
        { currency: 'EUR', amount: '1.5', events: 1 },
        { currency: 'USD', amount: '2', events: 2 },
      ]),
    ).toBe('1.5 EUR + $2');
    expect(formatPricedTotals([])).toBe('nothing priced');
    expect(countPricedEvents([{ currency: 'USD', amount: '1', events: 4 }])).toBe(4);
  });

  it('groups thousands in counts', () => {
    expect(formatCount('1234567')).toBe('1,234,567');
    expect(formatCount(950)).toBe('950');
  });

  it('gives the size of the gap in tokens, as a floor when some usage was unreadable', () => {
    expect(describeNotPricedTokens(notPriced())).toBe('41,250 tokens');
    expect(describeNotPricedTokens(notPriced({ USAGE_UNRECOGNIZED: reason(1, null) }))).toBe(
      'at least 41,250 tokens',
    );
  });

  it('lists only the reasons that occurred', () => {
    expect(describeNotPricedReasons(notPriced())).toBe(
      'unknown model 3 · missing price component 2',
    );
  });
});
