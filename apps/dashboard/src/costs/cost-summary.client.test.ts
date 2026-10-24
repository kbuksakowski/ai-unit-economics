import { describe, expect, it } from 'vitest';

import { fetchCostSummary } from './cost-summary.client';

const config = { apiUrl: 'http://api.test', readKey: 'aiue_read_secret' };
const query = {
  groupBy: 'customer' as const,
  from: '2026-10-01T00:00:00.000Z',
  to: '2026-11-01T00:00:00.000Z',
};

const summary = {
  groupBy: 'customer',
  from: query.from,
  to: query.to,
  groups: [{ key: 'acme', currency: 'USD', amount: '0.0392', pricedEvents: 2, leftOutEvents: 1 }],
  truncated: false,
};

function respond(status: number, body: unknown = {}): typeof fetch {
  return async () => new Response(JSON.stringify(body), { status });
}

describe('fetchCostSummary', () => {
  it('sends the read key and the explicit range', async () => {
    let request: { url: string; init: RequestInit | undefined } | undefined;
    const fetchImpl: typeof fetch = async (url, init) => {
      request = { url: String(url), init };
      return new Response(JSON.stringify(summary));
    };

    const result = await fetchCostSummary(config, query, fetchImpl);

    expect(result).toEqual({ ok: true, data: summary });
    expect(request!.url).toBe(
      'http://api.test/v1/costs/summary?groupBy=customer&from=2026-10-01T00%3A00%3A00.000Z&to=2026-11-01T00%3A00%3A00.000Z',
    );
    expect(request!.init?.headers).toEqual({ authorization: 'Bearer aiue_read_secret' });
  });

  it.each([
    ['a rejected key', respond(401), 'rejected the read key'],
    ['a server error', respond(500), 'answered 500'],
    ['an unexpected shape', respond(200, { groups: 'nope' }), 'does not understand'],
    [
      'an unreachable API',
      (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch,
      'unreachable',
    ],
  ])('turns %s into a message, never an empty table', async (_, fetchImpl, message) => {
    const result = await fetchCostSummary(config, query, fetchImpl);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain(message);
  });
});
