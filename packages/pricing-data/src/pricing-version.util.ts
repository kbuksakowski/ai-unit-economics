import { createHash } from 'node:crypto';

import type { PricingRate } from './pricing-rate.type.js';

/**
 * `<provider>-<YYYY-MM-DD>-<8 hex of sha256 over the rows>` (ADR-0006). The hash makes a
 * version verifiable: anyone can recompute it from the table it names.
 */
export function computePricingVersion(provider: string, rates: readonly PricingRate[]): string {
  const latest = rates.reduce(
    (max, r) => (r.provenance.observedAt > max ? r.provenance.observedAt : max),
    '',
  );
  const digest = createHash('sha256').update(canonicalJson(rates)).digest('hex').slice(0, 8);
  return `${provider}-${latest.slice(0, 10) || 'empty'}-${digest}`;
}

/** Key order must not change the hash, so objects are serialised with sorted keys. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
