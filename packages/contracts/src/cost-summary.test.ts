import { describe, expect, it } from 'vitest';

import { costSummaryGroupSchema, costSummaryQuerySchema } from './cost-summary.js';

const query = {
  groupBy: 'customer',
  from: '2026-10-01T00:00:00.000Z',
  to: '2026-11-01T00:00:00.000Z',
};

describe('cost summary contract', () => {
  it('accepts an explicit, ordered range', () => {
    expect(costSummaryQuerySchema.safeParse(query).success).toBe(true);
  });

  it.each([
    ['a missing from', { groupBy: 'customer', to: query.to }],
    ['a missing to', { groupBy: 'customer', from: query.from }],
    ['an empty range', { ...query, to: query.from }],
    ['a reversed range', { ...query, from: query.to, to: query.from }],
    ['an unknown grouping', { ...query, groupBy: 'model' }],
    ['a local time without offset rules', { ...query, from: '2026-10-01T00:00:00+02:00' }],
  ])('rejects %s', (_, value) => {
    expect(costSummaryQuerySchema.safeParse(value).success).toBe(false);
  });

  it('allows a null amount, which means nothing was priced', () => {
    const group = {
      key: 'cust_1',
      currency: 'USD',
      amount: null,
      pricedEvents: 0,
      leftOutEvents: 3,
    };
    expect(costSummaryGroupSchema.safeParse(group).success).toBe(true);
  });

  it.each(['0.10', '1e-3', '.5', '01'])('rejects a non-canonical decimal "%s"', (amount) => {
    const group = { key: null, currency: 'USD', amount, pricedEvents: 1, leftOutEvents: 0 };
    expect(costSummaryGroupSchema.safeParse(group).success).toBe(false);
  });
});
