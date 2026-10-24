import Anthropic from '@anthropic-ai/sdk';
import { ingestEnvelopeSchema, type IngestEnvelope } from '@ai-unit-economics/contracts';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  MESSAGE,
  REQUEST_ID,
  settle,
  startFakeAnthropic,
  startFakeIngestion,
  type FakeIngestion,
} from '../test/fake-servers.js';
import { createClient, type ClientConfig, type SdkDiagnostic } from './index.js';

let anthropicServer: Awaited<ReturnType<typeof startFakeAnthropic>>;
let ingestion: FakeIngestion;
let anthropic: Anthropic;

beforeAll(async () => {
  anthropicServer = await startFakeAnthropic();
  ingestion = await startFakeIngestion();
  anthropic = new Anthropic({ apiKey: 'sk-test', baseURL: anthropicServer.url, maxRetries: 0 });
});

afterEach(async () => {
  // Delivery is fire-and-forget; let it land so it cannot leak into the next test.
  await settle(50);
  ingestion.requests.length = 0;
  ingestion.mode = 'accept';
});

afterAll(async () => {
  await anthropicServer.close();
  await ingestion.close();
});

const params = {
  model: 'claude-sonnet-5',
  max_tokens: 16,
  messages: [{ role: 'user' as const, content: 'Hi' }],
};

function setup(overrides: Partial<ClientConfig> = {}) {
  const diagnostics: SdkDiagnostic[] = [];
  const client = createClient({
    apiKey: 'aiue_live_test',
    baseUrl: ingestion.url,
    onError: (d) => diagnostics.push(d),
    ...overrides,
  });
  return { client, diagnostics };
}

function waitForDiagnostic(diagnostics: SdkDiagnostic[], code: string): Promise<SdkDiagnostic> {
  return new Promise((resolve) => {
    const poll = () => {
      const found = diagnostics.find((d) => d.code === code);
      if (found) resolve(found);
      else setTimeout(poll, 5);
    };
    poll();
  });
}

const sentEvent = (index = 0) => (ingestion.requests[index]!.body as IngestEnvelope).events[0]!;

describe('the caller receives exactly what the provider returned', () => {
  it('resolves to the same message, with the request id the provider SDK attaches', async () => {
    const { client } = setup();
    const message = await client.track(() => anthropic.messages.create(params));

    expect(message).toEqual(MESSAGE);
    expect(message._request_id).toBe(REQUEST_ID);
  });

  it('keeps the APIPromise contract: withResponse() still works', async () => {
    const { client } = setup();
    const { data, response } = await client
      .track(() => anthropic.messages.create(params))
      .withResponse();

    expect(data).toEqual(MESSAGE);
    expect(response.status).toBe(200);
  });

  it('propagates a provider exception unchanged and sends nothing', async () => {
    const { client, diagnostics } = setup();
    const call = client.track(() => anthropic.messages.create({ ...params, model: 'fail' }));

    await expect(call).rejects.toBeInstanceOf(Anthropic.BadRequestError);
    await settle();
    expect(ingestion.requests).toHaveLength(0);
    expect(diagnostics).toEqual([]);
  });

  it('rethrows a synchronous exception from the wrapped function as is', () => {
    const { client } = setup();
    const error = new Error('boom');
    expect(() =>
      client.track(() => {
        throw error;
      }),
    ).toThrow(error);
  });

  it('returns a non-provider value untouched and sends nothing', async () => {
    const { client } = setup();
    const value = { answer: 42 };
    expect(client.track(() => value)).toBe(value);
    await settle();
    expect(ingestion.requests).toHaveLength(0);
  });
});

describe('the usage event', () => {
  it('carries the raw usage object untouched and conforms to the wire contract', async () => {
    const { client } = setup();
    await client.track(() => anthropic.messages.create(params), {
      customerId: 'cust_42',
      feature: 'summary',
    });
    await ingestion.received(1);

    const { headers, body } = ingestion.requests[0]!;
    expect(headers.authorization).toBe('Bearer aiue_live_test');
    expect(ingestEnvelopeSchema.safeParse(body).success).toBe(true);

    const event = sentEvent();
    expect(event).toMatchObject({
      provider: 'anthropic',
      providerClient: { name: '@anthropic-ai/sdk' },
      requestedModel: 'claude-sonnet-5',
      respondedModel: MESSAGE.model,
      providerRequestId: REQUEST_ID,
      operation: 'chat',
      status: 'success',
      usageStatus: 'reported',
      customerId: 'cust_42',
      feature: 'summary',
    });
    expect(event.rawUsage).toEqual(MESSAGE.usage);
    expect(event.usageEventId).toBe(event.idempotencyKey);
  });

  it('drops an invalid customerId, still sends the event, and says so', async () => {
    const { client, diagnostics } = setup();
    await client.track(() => anthropic.messages.create(params), { customerId: 'x'.repeat(257) });
    await ingestion.received(1);

    expect(sentEvent().customerId).toBeUndefined();
    expect(diagnostics.map((d) => d.code)).toEqual(['invalid_customer_id']);
  });

  it('sends nothing at all when disabled', async () => {
    const { client } = setup({ enabled: false });
    const message = await client.track(() => anthropic.messages.create(params));

    expect(message).toEqual(MESSAGE);
    await settle();
    expect(ingestion.requests).toHaveLength(0);
  });
});

describe('streaming is passed through, never reported as zero', () => {
  it('create({ stream: true }): untouched stream, not_reported event, one signal per client', async () => {
    const { client, diagnostics } = setup();
    for (let i = 0; i < 2; i++) {
      const stream = await client.track(() =>
        anthropic.messages.create({ ...params, stream: true }),
      );
      const types: string[] = [];
      for await (const event of stream) types.push(event.type);
      expect(types.at(-1)).toBe('message_stop');
    }
    await ingestion.received(2);

    expect(sentEvent()).toMatchObject({
      usageStatus: 'not_reported',
      requestedModel: 'claude-sonnet-5',
    });
    expect(sentEvent().rawUsage).toBeUndefined();
    expect(diagnostics.map((d) => d.code)).toEqual(['stream_not_supported']);
  });

  it('messages.stream(): the same MessageStream instance, a signal, no event', async () => {
    const { client, diagnostics } = setup();
    let original: unknown;
    const stream = client.track(() => {
      original = anthropic.messages.stream(params);
      return original;
    });

    expect(stream).toBe(original);
    await (stream as ReturnType<typeof anthropic.messages.stream>).finalMessage();
    await settle();
    expect(ingestion.requests).toHaveLength(0);
    expect(diagnostics.map((d) => d.code)).toEqual(['stream_not_supported']);
  });
});

describe('telemetry is fail-open', () => {
  it.each(['fail', 'reject'] as const)(
    'an ingestion that answers "%s" does not affect the call',
    async (mode) => {
      ingestion.mode = mode;
      const { client, diagnostics } = setup();

      await expect(client.track(() => anthropic.messages.create(params))).resolves.toEqual(MESSAGE);
      expect((await waitForDiagnostic(diagnostics, 'delivery_failed')).message).toBeTruthy();
    },
  );

  it('an unreachable ingestion does not affect the call', async () => {
    const { client, diagnostics } = setup({ baseUrl: 'http://127.0.0.1:1' });

    await expect(client.track(() => anthropic.messages.create(params))).resolves.toEqual(MESSAGE);
    await waitForDiagnostic(diagnostics, 'delivery_failed');
  });

  it('a hanging ingestion is not awaited, and times out into onError', async () => {
    ingestion.mode = 'hang';
    const { client, diagnostics } = setup({ timeoutMs: 50 });

    await expect(client.track(() => anthropic.messages.create(params))).resolves.toEqual(MESSAGE);
    expect(diagnostics).toEqual([]);
    await waitForDiagnostic(diagnostics, 'delivery_failed');
  });

  it('a throwing onError does not reach the caller', async () => {
    ingestion.mode = 'fail';
    let calls = 0;
    const client = createClient({
      apiKey: 'aiue_live_test',
      baseUrl: ingestion.url,
      onError: () => {
        calls++;
        throw new Error('caller bug');
      },
    });

    await expect(
      client.track(() => anthropic.messages.create(params), { customerId: '' }),
    ).resolves.toEqual(MESSAGE);
    await ingestion.received(1);
    await settle();
    expect(calls).toBe(2);
  });
});

describe('safety in the host application', () => {
  it('a rejecting async onError never becomes an unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', listener);
    try {
      ingestion.mode = 'fail';
      const client = createClient({
        apiKey: 'aiue_live_test',
        baseUrl: ingestion.url,
        onError: async () => {
          throw new Error('logger down');
        },
      });
      await expect(
        client.track(() => anthropic.messages.create(params), { customerId: '' }),
      ).resolves.toEqual(MESSAGE);
      await ingestion.received(1);
      await settle(200);
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', listener);
    }
  });

  it('leaves list pages iterable: wrapping must not turn a PagePromise into a plain promise', async () => {
    const { client } = setup();
    const ids: string[] = [];
    for await (const model of client.track(() => anthropic.models.list())) ids.push(model.id);
    expect(ids).toEqual(['claude-sonnet-5-5']);
    await settle();
    expect(ingestion.requests).toHaveLength(0);
  });

  it('does not report token counting as a call', async () => {
    const { client } = setup();
    const count = await client.track(() =>
      anthropic.messages.countTokens({ model: 'claude-sonnet-5', messages: params.messages }),
    );
    expect(count.input_tokens).toBe(12);
    await settle();
    expect(ingestion.requests).toHaveLength(0);
  });

  it.each([
    ['a missing baseUrl', { apiKey: 'aiue_live_test', baseUrl: undefined as unknown as string }],
    ['a missing apiKey', { apiKey: '', baseUrl: 'http://127.0.0.1:1' }],
    ['a zero timeout', { apiKey: 'aiue_live_test', baseUrl: 'http://127.0.0.1:1', timeoutMs: 0 }],
  ])('reports %s and runs disabled instead of crashing the host', async (_, config) => {
    const diagnostics: SdkDiagnostic[] = [];
    const client = createClient({ ...config, onError: (d) => diagnostics.push(d) });
    await expect(client.track(() => anthropic.messages.create(params))).resolves.toEqual(MESSAGE);
    expect(diagnostics.map((d) => d.code)).toEqual(['invalid_config']);
  });

  it('warns once about plain http to a remote host, and not for localhost', () => {
    const diagnostics: SdkDiagnostic[] = [];
    const onError = (d: SdkDiagnostic) => diagnostics.push(d);
    createClient({ apiKey: 'k', baseUrl: 'http://aiue.example.com', onError });
    createClient({ apiKey: 'k', baseUrl: 'http://localhost:3000', onError });
    createClient({ apiKey: 'k', baseUrl: 'https://aiue.example.com', onError });
    expect(diagnostics.map((d) => d.code)).toEqual(['insecure_transport']);
  });

  it('accepts null options from JavaScript callers', async () => {
    const { client } = setup();
    await client.track(() => anthropic.messages.create(params), null);
    await ingestion.received(1);
    expect(sentEvent().customerId).toBeUndefined();
  });

  it('reports an invalid customer id once per client, not on every call', async () => {
    const { client, diagnostics } = setup();
    await client.track(() => anthropic.messages.create(params), { customerId: '' });
    await client.track(() => anthropic.messages.create(params), { customerId: '' });
    await ingestion.received(2);
    expect(diagnostics.map((d) => d.code)).toEqual(['invalid_customer_id']);
  });

  it('caps deliveries in flight and drops the excess instead of piling up sockets', async () => {
    ingestion.mode = 'hang';
    const { client, diagnostics } = setup({ timeoutMs: 5_000 });
    for (let i = 0; i < 40; i++) await client.track(() => anthropic.messages.create(params));
    await settle(300);
    expect(ingestion.requests.length).toBeLessThanOrEqual(32);
    expect(diagnostics.filter((d) => d.message.includes('in flight'))).toHaveLength(1);
  });
});
