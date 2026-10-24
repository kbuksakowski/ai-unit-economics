/**
 * Two local HTTP servers: one stands in for Anthropic, reached through the real provider
 * SDK via `baseURL`, the other for our ingestion API. No credentials, no network.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export const MESSAGE = {
  id: 'msg_01',
  type: 'message',
  role: 'assistant',
  model: 'claude-sonnet-5-20260801',
  content: [{ type: 'text', text: 'Hello' }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: {
    input_tokens: 12,
    output_tokens: 3,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 40,
  },
};

export const REQUEST_ID = 'req_fake_123';

const STREAM_EVENTS = [
  ['message_start', { type: 'message_start', message: { ...MESSAGE, content: [] } }],
  [
    'content_block_start',
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  ],
  [
    'content_block_delta',
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } },
  ],
  ['content_block_stop', { type: 'content_block_stop', index: 0 }],
  [
    'message_delta',
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
  ],
  ['message_stop', { type: 'message_stop' }],
] as const;

async function readBody(req: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of req) body += String(chunk);
  return body;
}

async function listen(
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}` };
}

export async function startFakeAnthropic(): Promise<{ url: string; close: () => Promise<void> }> {
  const { server, url } = await listen(async (req, res) => {
    const raw = await readBody(req);
    if (req.url?.startsWith('/v1/models')) {
      res.writeHead(200, { 'content-type': 'application/json', 'request-id': REQUEST_ID });
      res.end(
        JSON.stringify({
          data: [
            {
              id: 'claude-sonnet-5-5',
              type: 'model',
              display_name: 'Sonnet',
              created_at: '2026-01-01T00:00:00Z',
            },
          ],
          has_more: false,
          first_id: 'claude-sonnet-5-5',
          last_id: 'claude-sonnet-5-5',
        }),
      );
      return;
    }
    if (req.url?.startsWith('/v1/messages/count_tokens')) {
      res.writeHead(200, { 'content-type': 'application/json', 'request-id': REQUEST_ID });
      res.end(JSON.stringify({ input_tokens: 12 }));
      return;
    }
    const body = JSON.parse(raw) as { model?: string; stream?: boolean };
    if (body.model === 'fail') {
      res.writeHead(400, { 'content-type': 'application/json', 'request-id': REQUEST_ID });
      res.end(
        JSON.stringify({
          type: 'error',
          error: { type: 'invalid_request_error', message: 'bad request' },
        }),
      );
      return;
    }
    if (body.stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'request-id': REQUEST_ID });
      for (const [event, data] of STREAM_EVENTS) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json', 'request-id': REQUEST_ID });
    res.end(JSON.stringify(MESSAGE));
  });
  return { url, close: () => close(server) };
}

export type IngestionMode = 'accept' | 'fail' | 'reject' | 'hang';

export interface FakeIngestion {
  url: string;
  mode: IngestionMode;
  requests: { headers: IncomingMessage['headers']; body: unknown }[];
  /** Resolves once `count` requests have arrived. */
  received(count: number): Promise<void>;
  close(): Promise<void>;
}

export async function startFakeIngestion(): Promise<FakeIngestion> {
  const waiters: { count: number; resolve: () => void }[] = [];
  const hanging: ServerResponse[] = [];
  const fake: FakeIngestion = {
    url: '',
    mode: 'accept',
    requests: [],
    received: (count) =>
      fake.requests.length >= count
        ? Promise.resolve()
        : new Promise((resolve) => waiters.push({ count, resolve })),
    close: async () => {
      for (const res of hanging) res.destroy();
      await close(server);
    },
  };
  const { server, url } = await listen(async (req, res) => {
    const body: unknown = JSON.parse(await readBody(req));
    fake.requests.push({ headers: req.headers, body });
    for (const waiter of waiters.filter((w) => fake.requests.length >= w.count)) waiter.resolve();
    switch (fake.mode) {
      case 'hang':
        hanging.push(res);
        return;
      case 'fail':
        res.writeHead(500).end();
        return;
      case 'reject':
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({ successes: [], errors: [{ code: 'invalid_event', message: 'no' }] }),
        );
        return;
      case 'accept':
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ successes: [], errors: [] }));
    }
  });
  fake.url = url;
  return fake;
}

function close(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}

/** For asserting that something did not happen. */
export const settle = (ms = 100): Promise<void> => new Promise((r) => setTimeout(r, ms));
