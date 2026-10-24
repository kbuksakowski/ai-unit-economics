import type { UsageEvent } from '@ai-unit-economics/contracts';

export interface DemoEventOptions {
  now: Date;
  /** Events are placed after this instant: the first price in the table (ADR-0006). */
  pricedFrom: Date;
  count?: number;
  seed?: number;
}

const CUSTOMERS = [
  ['acme', 30],
  ['globex', 12],
  ['initech', 9],
  ['umbrella', 8],
  ['hooli', 7],
  ['stark', 6],
  ['wayne', 5],
  ['wonka', 4],
  ['cyberdyne', 3],
  ['soylent', 2],
] as const;
const FEATURES = [
  ['chat', 5],
  ['invoice-parser', 3],
  ['search', 2],
  ['summary', 2],
] as const;
const MODELS = [
  ['claude-sonnet-5-5', 6],
  ['claude-haiku-4-5-20251001', 3],
  ['claude-opus-5-5', 1],
] as const;

export const DEMO_UNKNOWN_MODEL = 'claude-experimental-preview';

/** Mulberry32: tiny, seedable, and plenty for demo data. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic demo traffic. The same `now` and seed always yield the same events, so
 * the figures on the dashboard can be checked by hand.
 */
export function generateDemoEvents({
  now,
  pricedFrom,
  count = 300,
  seed = 42,
}: DemoEventOptions): UsageEvent[] {
  const next = random(seed);
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T extends string>(options: readonly (readonly [T, number])[]): T => {
    const total = options.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = next() * total;
    for (const [value, weight] of options) if ((roll -= weight) < 0) return value;
    return options.at(-1)![0];
  };
  const span = Math.max(now.getTime() - pricedFrom.getTime() - 60_000, 1);
  const uuid = () =>
    [8, 4, 4, 4, 12]
      .map((n, i) =>
        Array.from({ length: n }, (_, j) =>
          i === 2 && j === 0 ? '7' : i === 3 && j === 0 ? '8' : int(0, 15).toString(16),
        ).join(''),
      )
      .join('-');

  const events: UsageEvent[] = [];
  for (let i = 0; i < count; i++) {
    const model = pick(MODELS);
    const cached = next() < 0.4;
    const cacheWrite5m = cached && next() < 0.3 ? int(1_000, 8_000) : 0;
    const cacheWrite1h = cached && next() < 0.1 ? int(1_000, 4_000) : 0;
    const id = uuid();
    events.push({
      idempotencyKey: id,
      usageEventId: id,
      occurredAt: new Date(pricedFrom.getTime() + 60_000 + Math.floor(next() * span)).toISOString(),
      provider: 'anthropic',
      providerClient: { name: '@anthropic-ai/sdk', version: '0.124.0' },
      requestedModel: model,
      respondedModel: model,
      operation: 'chat',
      customerId: pick(CUSTOMERS),
      feature: pick(FEATURES),
      status: 'success',
      durationMs: int(300, 9_000),
      usageStatus: 'reported',
      rawUsage: {
        input_tokens: int(200, 6_000),
        output_tokens: int(50, 2_000),
        cache_read_input_tokens: cached ? int(2_000, 60_000) : 0,
        cache_creation_input_tokens: cacheWrite5m + cacheWrite1h,
        cache_creation: {
          ephemeral_5m_input_tokens: cacheWrite5m,
          ephemeral_1h_input_tokens: cacheWrite1h,
        },
        service_tier: 'standard',
      },
    });
  }

  // The gaps the product exists to show.
  // Gap positions are fixed for the default 300; a smaller demo simply has fewer gaps.
  const gap = (index: number, change: (event: UsageEvent) => UsageEvent) => {
    if (index < events.length) events[index] = change(events[index]!);
  };
  for (const index of [3, 41, 97, 150, 233]) {
    gap(index, ({ customerId: _, ...event }) => event);
  }
  for (const index of [12, 88, 201]) {
    gap(index, (event) => ({ ...event, respondedModel: DEMO_UNKNOWN_MODEL }));
  }
  for (const index of [55, 180]) {
    gap(index, (event) => ({
      ...event,
      rawUsage: { ...(event.rawUsage as Record<string, unknown>), inference_geo: 'us' },
    }));
  }
  for (const index of [70, 260]) {
    gap(index, ({ rawUsage: _, ...event }) => ({ ...event, usageStatus: 'not_reported' }));
  }
  for (const index of [20, 140]) {
    gap(index, (event) => ({
      ...event,
      occurredAt: new Date(pricedFrom.getTime() - 3_600_000 * ((index % 7) + 1)).toISOString(),
    }));
  }
  return events;
}
