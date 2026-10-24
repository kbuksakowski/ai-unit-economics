/**
 * The shape of a price row as pricing reads it. Declared here rather than imported from
 * `pricing-data`, because `core` depends on nothing (docs/architecture.md, ADR-0009); the API's
 * typecheck proves the two agree.
 */
export interface TokenRateSet {
  input: string;
  output: string;
  cacheRead: string | null;
  cacheWrite5m: string | null;
  cacheWrite1h: string | null;
}

export interface RateRow {
  model: string;
  /** Valid until the next row for the same model. */
  validFrom: string;
  currency: string;
  standard: TokenRateSet;
  batch: TokenRateSet | null;
  longContext: {
    aboveInputTokens: number;
    standard: TokenRateSet;
    batch: TokenRateSet | null;
  } | null;
}
