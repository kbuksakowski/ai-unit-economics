import { ANTHROPIC_NORMALIZATION_VERSION, normalizeAnthropicUsage } from './anthropic-usage.js';
import type { NormalizationResult } from './normalized-usage.js';

export interface VersionedNormalization {
  normalizationVersion: string;
  result: NormalizationResult;
}

const UNSUPPORTED_PROVIDER_VERSION = 'none';

/** The adapter version that would read this provider's usage, recorded even when there is none. */
export function normalizationVersionFor(provider: string): string {
  return provider === 'anthropic' ? ANTHROPIC_NORMALIZATION_VERSION : UNSUPPORTED_PROVIDER_VERSION;
}

/** Dispatches on the provider recorded with the event, never on the shape of the object. */
export function normalizeUsage(provider: string, raw: unknown): VersionedNormalization {
  const normalizationVersion = normalizationVersionFor(provider);
  if (provider === 'anthropic') {
    return { normalizationVersion, result: normalizeAnthropicUsage(raw) };
  }
  return {
    normalizationVersion,
    result: { status: 'UNRECOGNIZED_SHAPE', reason: `no adapter for provider ${provider}` },
  };
}
