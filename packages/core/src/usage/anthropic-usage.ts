import { USAGE_DETAIL, type NormalizationResult } from './normalized-usage.js';

/** Bump when the mapping below changes; stored on every usage fact (ADR-0007). */
// anthropic-2 (2026-10-24): reads `speed`, which Anthropic added to the usage object.
export const ANTHROPIC_NORMALIZATION_VERSION = 'anthropic-2';

const KNOWN_KEYS = new Set([
  'input_tokens',
  'output_tokens',
  'cache_read_input_tokens',
  'cache_creation_input_tokens',
  'cache_creation',
  'server_tool_use',
  'service_tier',
  'inference_geo',
  'speed',
  'output_tokens_details',
]);

const KNOWN_SERVER_TOOLS: Record<string, string> = {
  web_search_requests: USAGE_DETAIL.webSearchRequests,
  web_fetch_requests: USAGE_DETAIL.webFetchRequests,
  code_execution_requests: USAGE_DETAIL.codeExecutionRequests,
};

class Unrecognized extends Error {}

/**
 * Anthropic reports cache tokens disjoint from `input_tokens`, so total input is their sum
 * (ADR-0007). Getting this direction wrong is the 2.5x error comparable tools ship.
 *
 * Strict on purpose: an unknown key may be a new billable bucket from a newer SDK, and
 * ignoring it would understate cost. Unknown shape is reported, never guessed (ADR-0009).
 */
export function normalizeAnthropicUsage(raw: unknown): NormalizationResult {
  try {
    const usage = record(raw, 'usage');
    const unknown = Object.keys(usage).filter((key) => !KNOWN_KEYS.has(key));
    if (unknown.length) throw new Unrecognized(`unknown usage keys: ${unknown.join(', ')}`);

    const fresh = count(usage.input_tokens, 'input_tokens');
    const output = count(usage.output_tokens, 'output_tokens');
    // Nullable in the provider's types; null means none were read or written.
    const cacheRead = optionalCount(usage.cache_read_input_tokens, 'cache_read_input_tokens');
    const cacheWrite = optionalCount(
      usage.cache_creation_input_tokens,
      'cache_creation_input_tokens',
    );

    const details: Record<string, bigint> = {};
    if (fresh > 0n) details[USAGE_DETAIL.freshInput] = fresh;
    splitCacheWrites(usage.cache_creation, cacheWrite, details);
    readServerTools(usage.server_tool_use, details);
    readOutputDetails(usage.output_tokens_details);

    return {
      status: 'NORMALIZED',
      usage: {
        inputTokens: fresh + cacheRead + cacheWrite,
        outputTokens: output,
        cachedInputTokens: cacheRead,
        details,
        serviceTier: optionalString(usage.service_tier, 'service_tier'),
        inferenceGeo: optionalString(usage.inference_geo, 'inference_geo'),
        speed: optionalString(usage.speed, 'speed'),
      },
    };
  } catch (error) {
    if (error instanceof Unrecognized)
      return { status: 'UNRECOGNIZED_SHAPE', reason: error.message };
    throw error;
  }
}

/** The TTL split prices differently (1.25x vs 2x); without it the write cannot be priced. */
function splitCacheWrites(raw: unknown, total: bigint, details: Record<string, bigint>): void {
  if (raw === null || raw === undefined) {
    if (total > 0n) details[USAGE_DETAIL.cacheWriteUnknownTtl] = total;
    return;
  }
  const split = record(raw, 'cache_creation');
  const unknown = Object.keys(split).filter(
    (key) => key !== 'ephemeral_5m_input_tokens' && key !== 'ephemeral_1h_input_tokens',
  );
  if (unknown.length) throw new Unrecognized(`unknown cache_creation keys: ${unknown.join(', ')}`);
  const fiveMinutes = optionalCount(split.ephemeral_5m_input_tokens, 'ephemeral_5m_input_tokens');
  const oneHour = optionalCount(split.ephemeral_1h_input_tokens, 'ephemeral_1h_input_tokens');
  if (fiveMinutes + oneHour !== total) {
    throw new Unrecognized(
      `cache_creation split ${fiveMinutes + oneHour} does not match cache_creation_input_tokens ${total}`,
    );
  }
  if (fiveMinutes > 0n) details[USAGE_DETAIL.cacheWrite5m] = fiveMinutes;
  if (oneHour > 0n) details[USAGE_DETAIL.cacheWrite1h] = oneHour;
}

// A breakdown of output_tokens, which stays the billed total. Read only to stay strict: a new
// sub-bucket here could be billed separately.
function readOutputDetails(raw: unknown): void {
  if (raw === null || raw === undefined) return;
  for (const [key, value] of Object.entries(record(raw, 'output_tokens_details'))) {
    if (key !== 'thinking_tokens') {
      throw new Unrecognized(`unknown output_tokens_details key: ${key}`);
    }
    count(value, key);
  }
}

function readServerTools(raw: unknown, details: Record<string, bigint>): void {
  if (raw === null || raw === undefined) return;
  for (const [key, value] of Object.entries(record(raw, 'server_tool_use'))) {
    const detail = KNOWN_SERVER_TOOLS[key];
    if (!detail) throw new Unrecognized(`unknown server_tool_use key: ${key}`);
    const requests = count(value, key);
    if (requests > 0n) details[detail] = requests;
  }
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Unrecognized(`${name} is not an object`);
  }
  return value as Record<string, unknown>;
}

function count(value: unknown, name: string): bigint {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Unrecognized(`${name} is not a non-negative integer`);
  }
  return BigInt(value);
}

function optionalCount(value: unknown, name: string): bigint {
  return value === null || value === undefined ? 0n : count(value, name);
}

function optionalString(value: unknown, name: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Unrecognized(`${name} is not a string`);
  return value;
}
