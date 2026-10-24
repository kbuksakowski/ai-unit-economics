/**
 * Converts a per-token price from the upstream JSON into an exact per-million-token decimal
 * string. Done on the number's shortest decimal representation, never by multiplying a
 * float, which would turn 1e-7 into 0.09999999999999999.
 */
export function toPerMillionTokens(perToken: number): string {
  if (!Number.isFinite(perToken) || perToken < 0) {
    throw new Error(`Invalid per-token price: ${perToken}`);
  }
  const [mantissa, exponentPart] = perToken.toString().split('e');
  const exponent = Number(exponentPart ?? 0) + 6;
  const [whole, fraction = ''] = mantissa!.split('.');
  const digits = whole + fraction;
  const pointAt = whole!.length + exponent;

  const padded = pointAt <= 0 ? '0'.repeat(1 - pointAt) + digits : digits.padEnd(pointAt, '0');
  const point = Math.max(pointAt, 1);
  const integer = padded.slice(0, point).replace(/^0+(?=\d)/, '');
  const decimals = padded.slice(point).replace(/0+$/, '');
  return decimals ? `${integer}.${decimals}` : integer;
}
