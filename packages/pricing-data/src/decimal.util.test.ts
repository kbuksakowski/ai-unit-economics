import { describe, expect, it } from 'vitest';

import { toPerMillionTokens } from './decimal.util.js';

describe('toPerMillionTokens', () => {
  it.each([
    [0.000003, '3'],
    [0.000015, '15'],
    [1e-7, '0.1'],
    [2e-7, '0.2'],
    [2.5e-7, '0.25'],
    [6.25e-7, '0.625'],
    [0.00000125, '1.25'],
    [0.0000225, '22.5'],
    [5e-8, '0.05'],
    [0, '0'],
    [1, '1000000'],
  ])('%s per token is %s per million, exactly', (perToken, expected) => {
    expect(toPerMillionTokens(perToken)).toBe(expected);
  });

  it('does not reproduce float multiplication noise', () => {
    expect(1e-7 * 1e6).not.toBe(0.1);
    expect(toPerMillionTokens(1e-7)).toBe('0.1');
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s', (value) => {
    expect(() => toPerMillionTokens(value)).toThrow();
  });
});
