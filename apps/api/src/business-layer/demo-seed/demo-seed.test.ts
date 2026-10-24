import type { UsageEvent } from '@ai-unit-economics/contracts';
import { ANTHROPIC_RATES } from '@ai-unit-economics/pricing-data';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startTestApp, type TestApp } from '../../../test/app.js';
import { seedDemo } from './demo-seed.js';
import { DEMO_UNKNOWN_MODEL, generateDemoEvents } from './demo-seed.util.js';

let app: TestApp;

beforeAll(async () => {
  app = await startTestApp();
});

afterAll(async () => {
  await app.close();
});

const pricedFrom = new Date(ANTHROPIC_RATES.map((r) => r.validFrom).sort()[0]!);
const now = new Date(pricedFrom.getTime() + 86_400_000);

/**
 * Official per-million rates in thousandths of a dollar, copied by hand from
 * https://platform.claude.com/docs/en/about-claude/pricing (2026-10-03): input, output,
 * cache read, 5-minute write, 1-hour write. Independent of the engine and of pricing-data.
 */
const RATES_MILLI: Record<string, [number, number, number, number, number]> = {
  'claude-sonnet-5-5': [2_000, 10_000, 200, 2_500, 4_000],
  'claude-haiku-4-5-20251001': [1_000, 5_000, 100, 1_250, 2_000],
  'claude-opus-5-5': [4_000, 20_000, 200, 5_000, 8_000],
};

/** tokens × (rate per million in milli-dollars) is the cost in nano-dollars: exact integers. */
function expectedNanoDollars(event: UsageEvent): bigint | null {
  const usage = event.rawUsage as
    | Record<string, number | Record<string, number> | string>
    | undefined;
  const rates = RATES_MILLI[event.respondedModel ?? ''];
  if (
    !usage ||
    !rates ||
    usage.inference_geo === 'us' ||
    Date.parse(event.occurredAt) < pricedFrom.getTime()
  ) {
    return null;
  }
  const split = usage.cache_creation as Record<string, number>;
  const tokens = [
    usage.input_tokens as number,
    usage.output_tokens as number,
    usage.cache_read_input_tokens as number,
    split.ephemeral_5m_input_tokens!,
    split.ephemeral_1h_input_tokens!,
  ];
  return tokens.reduce((sum, count, i) => sum + BigInt(count) * BigInt(rates[i]!), 0n);
}

function nanoToDecimal(nano: bigint): string {
  const digits = nano.toString().padStart(10, '0');
  const whole = digits.slice(0, -9).replace(/^0+(?=\d)/, '');
  const fraction = digits.slice(-9).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

describe('demo seed', () => {
  const events = generateDemoEvents({ now, pricedFrom });

  it('is deterministic', () => {
    const again = generateDemoEvents({ now, pricedFrom });
    expect(again.map((e) => [e.customerId, e.respondedModel, e.rawUsage])).toEqual(
      events.map((e) => [e.customerId, e.respondedModel, e.rawUsage]),
    );
  });

  it('seeds figures that match an independent calculation, and shows every kind of gap', async () => {
    const result = await seedDemo(
      { projects: app.projects, ingestion: app.ingestion, derivation: app.derivation },
      events,
    );
    expect(result).toMatchObject({ seeded: true, accepted: 300, rejected: 0 });

    const expected = new Map<string | null, bigint>();
    for (const event of events) {
      const cost = expectedNanoDollars(event);
      if (cost === null) continue;
      const key = event.customerId ?? null;
      expected.set(key, (expected.get(key) ?? 0n) + cost);
    }

    const rows = await app.costFacts.sumCurrentByGroup(
      result.projectId,
      'customer',
      new Date(pricedFrom.getTime() - 86_400_000),
      new Date(now.getTime() + 86_400_000),
      1_000,
    );
    const actual = new Map(
      rows
        .filter((r) => r.pricedAmount !== null)
        .map((r) => [
          r.groupKey,
          nanoToDecimal(BigInt(r.pricedAmount!.replace('.', '').replace(/^0+(?=\d)/, '')) / 1000n),
        ]),
    );
    expect(actual).toEqual(new Map([...expected].map(([k, v]) => [k, nanoToDecimal(v)])));

    const statuses = (await app.costFacts.findAllByProjectId(result.projectId)).reduce<
      Record<string, number>
    >((counts, fact) => ({ ...counts, [fact.status]: (counts[fact.status] ?? 0) + 1 }), {});
    expect(statuses).toEqual({
      PRICED: 291,
      UNKNOWN_MODEL: 3,
      MISSING_PRICE_COMPONENT: 2,
      NOT_MEASURED: 2,
      NO_RATE_FOR_PERIOD: 2,
    });
    expect(events.filter((e) => e.respondedModel === DEMO_UNKNOWN_MODEL)).toHaveLength(3);
    expect(rows.some((r) => r.groupKey === null)).toBe(true);
  });

  it('with fixed keys, seeds once and is a no-op on the second run', async () => {
    const suffix = Date.now().toString(36);
    const keys = { ingestionKey: `aiue_live_demo${suffix}`, readKey: `aiue_read_demo${suffix}` };
    const services = {
      projects: app.projects,
      ingestion: app.ingestion,
      derivation: app.derivation,
    };
    const few = generateDemoEvents({ now, pricedFrom, count: 20 });

    const first = await seedDemo(services, few, { keys });
    const second = await seedDemo(services, few, { keys });

    expect(first).toMatchObject({ seeded: true, accepted: 20 });
    expect(second).toMatchObject({ seeded: false, projectId: first.projectId, accepted: 0 });
    expect(await app.usageEvents.findAllByProjectId(first.projectId)).toHaveLength(20);
  });
});
