import { describe, expect, it } from 'vitest';
import { CurrencyMismatchError, InvalidMoneyError, Money, ratio } from './money.js';

describe('Money parsing', () => {
  it('preserves the scale exactly as written', () => {
    expect(Money.of('199.00', 'USD').amount).toBe('199.00');
    expect(Money.of('199', 'USD').amount).toBe('199');
    expect(Money.of('0.0000871', 'USD').amount).toBe('0.0000871');
  });

  it('round-trips through JSON without losing amount or currency', () => {
    const json = { amount: '0.0000871', currency: 'USD' };
    expect(Money.fromJSON(json).toJSON()).toEqual(json);
  });

  it('rejects malformed input', () => {
    expect(() => Money.of('19.9.9', 'USD')).toThrow(InvalidMoneyError);
    expect(() => Money.of('abc', 'USD')).toThrow(InvalidMoneyError);
    expect(() => Money.of('1.00', 'dollars')).toThrow(InvalidMoneyError);
  });
});

describe('Money arithmetic', () => {
  it('aligns differing scales when adding', () => {
    expect(Money.of('1.5', 'USD').add(Money.of('0.005', 'USD')).amount).toBe('1.505');
  });

  it('refuses to combine different currencies', () => {
    expect(() => Money.of('1.00', 'USD').add(Money.of('1.00', 'EUR'))).toThrow(
      CurrencyMismatchError,
    );
  });

  it('computes negative AI contribution', () => {
    const revenue = Money.of('49.00', 'USD');
    const cost = Money.of('73.00', 'USD');
    const contribution = revenue.subtract(cost);

    expect(contribution.amount).toBe('-24.00');
    expect(contribution.isNegative()).toBe(true);
  });

  it('prices a usage fact from a per-million-token rate', () => {
    const perMillionTokens = Money.of('1.25', 'USD');
    const cost = perMillionTokens.multiplyByCount(12_500).divideByCount(1_000_000, 8);

    expect(cost.amount).toBe('0.01562500');
  });

  it('rejects fractional counts', () => {
    expect(() => Money.of('1.00', 'USD').multiplyByCount(1.5)).toThrow(InvalidMoneyError);
  });
});

describe('Money rounding', () => {
  it('rounds half away from zero by default', () => {
    expect(Money.of('0.125', 'USD').rescale(2).amount).toBe('0.13');
    expect(Money.of('-0.125', 'USD').rescale(2).amount).toBe('-0.13');
  });

  it('rounds half to even when asked', () => {
    expect(Money.of('0.125', 'USD').rescale(2, 'half-even').amount).toBe('0.12');
    expect(Money.of('0.135', 'USD').rescale(2, 'half-even').amount).toBe('0.14');
  });

  it('widens the scale without changing the value', () => {
    expect(Money.of('49', 'USD').rescale(4).amount).toBe('49.0000');
  });
});

describe('ratio', () => {
  it('expresses AI cost against revenue', () => {
    expect(ratio(Money.of('73.00', 'USD'), Money.of('49.00', 'USD'))).toBe('1.4898');
    expect(ratio(Money.of('31.00', 'USD'), Money.of('199.00', 'USD'))).toBe('0.1558');
  });

  it('returns null when there is no attributed revenue', () => {
    expect(ratio(Money.of('73.00', 'USD'), Money.of('0.00', 'USD'))).toBeNull();
  });

  it('refuses to compare different currencies', () => {
    expect(() => ratio(Money.of('1.00', 'USD'), Money.of('1.00', 'EUR'))).toThrow(
      CurrencyMismatchError,
    );
  });
});
