import { describe, expect, it } from 'vitest';

import { costOverviewQuerySchema, costOverviewResponseSchema } from './cost-overview.js';

const range = { from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' };
const reason = { events: 0, tokens: '0' };
const overview = {
  ...range,
  priced: [{ currency: 'USD', amount: '4.66', events: 291 }],
  unattributed: { events: 5, priced: [{ currency: 'USD', amount: '0.074', events: 5 }] },
  notPriced: {
    events: 7,
    knownTokens: '41000',
    byReason: {
      UNKNOWN_MODEL: { events: 3, tokens: '20000' },
      MISSING_PRICE_COMPONENT: { events: 2, tokens: '15000' },
      NO_RATE_FOR_PERIOD: { events: 2, tokens: '6000' },
      USAGE_UNRECOGNIZED: reason,
    },
  },
  notMeasured: { events: 2 },
};

describe('cost overview contract', () => {
  it('accepts a full overview', () => {
    expect(costOverviewResponseSchema.safeParse(overview).success).toBe(true);
  });

  it('allows unreadable usage to have unknown tokens', () => {
    const withUnknown = structuredClone(overview);
    withUnknown.notPriced.byReason.USAGE_UNRECOGNIZED = {
      events: 1,
      tokens: null as unknown as string,
    };
    expect(costOverviewResponseSchema.safeParse(withUnknown).success).toBe(true);
  });

  it('carries token counts as strings, which a 64-bit count needs', () => {
    const asNumber = structuredClone(overview) as unknown as {
      notPriced: { knownTokens: unknown };
    };
    asNumber.notPriced.knownTokens = 41000;
    expect(costOverviewResponseSchema.safeParse(asNumber).success).toBe(false);
  });

  it('requires an explicit, ordered range', () => {
    expect(costOverviewQuerySchema.safeParse(range).success).toBe(true);
    expect(costOverviewQuerySchema.safeParse({ from: range.from }).success).toBe(false);
    expect(costOverviewQuerySchema.safeParse({ from: range.to, to: range.from }).success).toBe(
      false,
    );
  });
});
