/**
 * Token counts that mean the same thing for every provider (docs/architecture.md). Counts are
 * `bigint`: a token count is never a float, and sums across a year must not lose precision.
 */
export interface NormalizedUsage {
  /** All input, cached or not — the OpenTelemetry GenAI meaning of input tokens. */
  inputTokens: bigint;
  outputTokens: bigint;
  /** Input served from the prompt cache. A subset of `inputTokens`. */
  cachedInputTokens: bigint;
  /** Every other bucket, by name. Absent means the provider reported none. */
  details: Record<string, bigint>;
  /** Non-count properties that change the price. */
  serviceTier: string | null;
  inferenceGeo: string | null;
  /** `standard` or `fast`; fast mode bills at separate rates. Null when not reported. */
  speed: string | null;
}

export type NormalizationResult =
  | { status: 'NORMALIZED'; usage: NormalizedUsage }
  | { status: 'UNRECOGNIZED_SHAPE'; reason: string };

/** Detail keys shared by normalisation and pricing. */
export const USAGE_DETAIL = {
  freshInput: 'fresh_input',
  cacheWrite5m: 'cache_write_5m',
  cacheWrite1h: 'cache_write_1h',
  cacheWriteUnknownTtl: 'cache_write_unknown_ttl',
  webSearchRequests: 'web_search_requests',
  webFetchRequests: 'web_fetch_requests',
  codeExecutionRequests: 'code_execution_requests',
} as const;
