/**
 * Per-million-token USD rates as decimal strings, exactly as providers publish them.
 * Never `number`: money is never a float here. `null` means the source does not say,
 * which pricing must report as unknown, never as zero.
 */
export interface TokenRates {
  input: string;
  output: string;
  cacheRead: string | null;
  cacheWrite5m: string | null;
  cacheWrite1h: string | null;
}

/** A higher rate that applies once a request's input exceeds a threshold. */
export interface LongContextRates {
  aboveInputTokens: number;
  standard: TokenRates;
  batch: TokenRates | null;
}

/**
 * `EXACT` when the provider's announcement date is known, `OBSERVED` when only the moment
 * we saw the price is. Conflating them yields plausible-but-wrong history (ADR-0006).
 */
export type PricingConfidence = 'EXACT' | 'OBSERVED';

export interface PricingProvenance {
  source: string;
  snapshotSha: string | null;
  observedAt: string;
  /** Null when the announcement date is unknown; pricing before `observedAt` is then uncertain. */
  effectiveAt: string | null;
  confidence: PricingConfidence;
}

/**
 * One effective-dated price for one model. There is no `validTo`: a row is valid until the
 * next row for the same model, so rows are only ever appended and intervals cannot overlap
 * or leave gaps.
 */
export interface PricingRate {
  provider: 'anthropic';
  model: string;
  validFrom: string;
  currency: 'USD';
  standard: TokenRates;
  batch: TokenRates | null;
  longContext: LongContextRates | null;
  provenance: PricingProvenance;
}
