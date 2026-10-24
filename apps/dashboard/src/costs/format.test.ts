import { describe, expect, it } from 'vitest';

import { formatAmount, formatGroupKey } from './format';

describe('formatAmount', () => {
  it.each([
    ['0.0392', '$0.0392'],
    ['0.000000006', '$0.000000006'],
    ['1234567.5', '$1,234,567.5'],
    ['12', '$12'],
    ['-0.5', '-$0.5'],
  ])('shows %s exactly as %s, never rounded to cents', (amount, expected) => {
    expect(formatAmount(amount, 'USD')).toBe(expected);
  });

  it('says "not priced" instead of $0 when nothing could be priced', () => {
    expect(formatAmount(null, 'USD')).toBe('not priced');
  });

  it('falls back to the currency code it has no symbol for', () => {
    expect(formatAmount('1000.25', 'EUR')).toBe('1,000.25 EUR');
  });
});

describe('formatGroupKey', () => {
  it('names usage without a customer or feature instead of hiding it', () => {
    expect(formatGroupKey(null, 'customer')).toBe('(no customer)');
    expect(formatGroupKey(null, 'feature')).toBe('(no feature)');
    expect(formatGroupKey('acme', 'customer')).toBe('acme');
  });
});
