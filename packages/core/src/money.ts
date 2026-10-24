/**
 * Money is the only representation of a monetary fact in the domain.
 *
 * Two rules that must not be relaxed (docs/architecture.md, Money):
 *   1. A monetary value is never a JavaScript `number` in domain logic.
 *   2. The original amount and currency are never lost.
 *
 * Values are held as a scaled integer (`units` at `scale` decimal places), which
 * keeps sub-cent inference costs such as "0.0000871" exact.
 */

const AMOUNT_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export type Rounding = 'half-up' | 'half-even';

export interface MoneyJson {
  amount: string;
  currency: string;
}

export class CurrencyMismatchError extends Error {
  constructor(left: string, right: string) {
    super(`Cannot combine money in ${left} with money in ${right}`);
    this.name = 'CurrencyMismatchError';
  }
}

export class InvalidMoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMoneyError';
  }
}

function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

function divideWithRounding(numerator: bigint, denominator: bigint, rounding: Rounding): bigint {
  if (denominator === 0n) {
    throw new InvalidMoneyError('Division by zero');
  }
  const negative = numerator < 0n !== denominator < 0n;
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDenominator = denominator < 0n ? -denominator : denominator;

  const quotient = absNumerator / absDenominator;
  const remainder = absNumerator % absDenominator;
  const twiceRemainder = remainder * 2n;

  let rounded = quotient;
  if (twiceRemainder > absDenominator) {
    rounded += 1n;
  } else if (twiceRemainder === absDenominator) {
    const roundUp = rounding === 'half-up' || quotient % 2n === 1n;
    if (roundUp) {
      rounded += 1n;
    }
  }
  return negative ? -rounded : rounded;
}

function toWholeNumber(value: bigint | number): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (!Number.isInteger(value)) {
    throw new InvalidMoneyError(`Count must be a whole number, received ${value}`);
  }
  return BigInt(value);
}

export class Money {
  private constructor(
    private readonly units: bigint,
    private readonly scale: number,
    readonly currency: string,
  ) {}

  /** Parses a decimal string, preserving the scale exactly as written. */
  static of(amount: string, currency: string): Money {
    if (!CURRENCY_PATTERN.test(currency)) {
      throw new InvalidMoneyError(
        `Currency must be a 3-letter ISO 4217 code, received "${currency}"`,
      );
    }
    const match = AMOUNT_PATTERN.exec(amount);
    if (!match) {
      throw new InvalidMoneyError(`Amount must be a decimal string, received "${amount}"`);
    }
    const sign = match[1] === '-' ? -1n : 1n;
    const whole = match[2] ?? '0';
    const fraction = match[3] ?? '';
    const units = sign * BigInt(whole + fraction);
    return new Money(units, fraction.length, currency);
  }

  static fromJSON(json: MoneyJson): Money {
    return Money.of(json.amount, json.currency);
  }

  static zero(currency: string, scale = 0): Money {
    return new Money(0n, scale, currency).rescale(scale);
  }

  /** Canonical decimal string at the current scale. */
  get amount(): string {
    const negative = this.units < 0n;
    const digits = (negative ? -this.units : this.units).toString().padStart(this.scale + 1, '0');
    const whole = digits.slice(0, digits.length - this.scale);
    const fraction = this.scale === 0 ? '' : `.${digits.slice(digits.length - this.scale)}`;
    return `${negative ? '-' : ''}${whole}${fraction}`;
  }

  toJSON(): MoneyJson {
    return { amount: this.amount, currency: this.currency };
  }

  toString(): string {
    return `${this.amount} ${this.currency}`;
  }

  /** Re-expresses the value at a different number of decimal places. */
  rescale(scale: number, rounding: Rounding = 'half-up'): Money {
    if (!Number.isInteger(scale) || scale < 0) {
      throw new InvalidMoneyError(`Scale must be a non-negative integer, received ${scale}`);
    }
    if (scale === this.scale) {
      return this;
    }
    if (scale > this.scale) {
      return new Money(this.units * pow10(scale - this.scale), scale, this.currency);
    }
    const units = divideWithRounding(this.units, pow10(this.scale - scale), rounding);
    return new Money(units, scale, this.currency);
  }

  private alignedWith(other: Money): [bigint, bigint, number] {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
    const scale = Math.max(this.scale, other.scale);
    return [
      this.units * pow10(scale - this.scale),
      other.units * pow10(scale - other.scale),
      scale,
    ];
  }

  add(other: Money): Money {
    const [left, right, scale] = this.alignedWith(other);
    return new Money(left + right, scale, this.currency);
  }

  subtract(other: Money): Money {
    const [left, right, scale] = this.alignedWith(other);
    return new Money(left - right, scale, this.currency);
  }

  /** Multiplies by a whole count, such as a token count. */
  multiplyByCount(count: bigint | number): Money {
    return new Money(this.units * toWholeNumber(count), this.scale, this.currency);
  }

  /** Divides by a whole number, producing a value at the requested scale. */
  divideByCount(divisor: bigint | number, scale: number, rounding: Rounding = 'half-up'): Money {
    const factor = toWholeNumber(divisor);
    const units = divideWithRounding(
      this.units * pow10(scale),
      factor * pow10(this.scale),
      rounding,
    );
    return new Money(units, scale, this.currency);
  }

  /**
   * Ratio between two monetary values, as a decimal string.
   *
   * Meant for cost / revenue ratios; revenue is not surfaced yet. Returns null when the denominator is zero, because
   * "no attributed revenue" is not the same fact as "a ratio of zero".
   */
  static ratio(numerator: Money, denominator: Money, decimals = 4): string | null {
    const [left, right] = numerator.alignedWith(denominator);
    if (right === 0n) {
      return null;
    }
    return formatScaled(divideWithRounding(left * pow10(decimals), right, 'half-up'), decimals);
  }

  compare(other: Money): -1 | 0 | 1 {
    const [left, right] = this.alignedWith(other);
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.compare(other) === 0;
  }

  isNegative(): boolean {
    return this.units < 0n;
  }

  isZero(): boolean {
    return this.units === 0n;
  }
}

export const ratio = Money.ratio;

function formatScaled(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, digits.length - scale);
  const fraction = scale === 0 ? '' : `.${digits.slice(digits.length - scale)}`;
  return `${negative ? '-' : ''}${whole}${fraction}`;
}
