const CURRENCY_SYMBOL: Record<string, string> = { USD: '$' };

/**
 * The exact decimal from the API, never rounded to cents: a fraction of a cent rounded to
 * $0.00 reads as free. No amount means nothing was priced, which is not zero (ADR-0011).
 */
export function formatAmount(amount: string | null, currency: string): string {
  if (amount === null) return 'not priced';
  const negative = amount.startsWith('-');
  const [whole, fraction] = (negative ? amount.slice(1) : amount).split('.');
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const symbol = CURRENCY_SYMBOL[currency];
  const number = fraction ? `${grouped}.${fraction}` : grouped;
  const signed = `${negative ? '-' : ''}${symbol ?? ''}${number}`;
  return symbol ? signed : `${signed} ${currency}`;
}

export function formatGroupKey(key: string | null, groupBy: 'customer' | 'feature'): string {
  return key ?? (groupBy === 'customer' ? '(no customer)' : '(no feature)');
}
