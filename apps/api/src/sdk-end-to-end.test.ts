/**
 * The whole first half of the vertical slice: a real provider SDK call, wrapped by our
 * SDK, delivered to the real API, stored in MariaDB. Only Anthropic is a stand-in.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import Anthropic from '@anthropic-ai/sdk';
import { createClient, type SdkDiagnostic } from '@ai-unit-economics/sdk';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { startTestApp, type TestApp } from '../test/app.js';

const USAGE = { input_tokens: 12, output_tokens: 3, cache_read_input_tokens: 40 };

let app: TestApp;
let fakeAnthropic: Server;
let anthropicUrl: string;

beforeAll(async () => {
  // The background loop on, as in production, so the whole path to a cost fact is exercised.
  app = await startTestApp({ factDerivationIntervalMs: 50 });
  fakeAnthropic = createServer((_, res) => {
    res.writeHead(200, { 'content-type': 'application/json', 'request-id': 'req_e2e' });
    res.end(
      JSON.stringify({
        id: 'msg_e2e',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-5-20260801',
        content: [{ type: 'text', text: 'Hello' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: USAGE,
      }),
    );
  });
  await new Promise<void>((resolve) => fakeAnthropic.listen(0, '127.0.0.1', resolve));
  anthropicUrl = `http://127.0.0.1:${(fakeAnthropic.address() as AddressInfo).port}`;
});

afterAll(async () => {
  fakeAnthropic.closeAllConnections();
  await new Promise((resolve) => fakeAnthropic.close(resolve));
  await app.close();
});

it('a tracked Anthropic call lands in usage_events, attributed and untouched', async () => {
  const project = await app.createProject();
  const diagnostics: SdkDiagnostic[] = [];
  const client = createClient({
    apiKey: project.apiKey,
    baseUrl: app.url,
    onError: (d) => diagnostics.push(d),
  });
  const anthropic = new Anthropic({ apiKey: 'sk-test', baseURL: anthropicUrl, maxRetries: 0 });

  const message = await client.track(
    () =>
      anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    { customerId: 'cust_42', feature: 'summary' },
  );
  expect(message.usage).toEqual(USAGE);

  let rows = await app.usageEvents.findAllByProjectId(project.id);
  for (let i = 0; i < 100 && rows.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 20));
    rows = await app.usageEvents.findAllByProjectId(project.id);
  }

  expect(diagnostics).toEqual([]);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    requestedModel: 'claude-sonnet-5',
    respondedModel: 'claude-sonnet-5-20260801',
    providerRequestId: 'req_e2e',
    customerId: 'cust_42',
    feature: 'summary',
    usageStatus: 'reported',
    rawUsage: USAGE,
    sdkName: '@ai-unit-economics/sdk',
  });

  // The fake answers as claude-sonnet-5-20260801, which is not in the price table, so the
  // loop must produce an UNKNOWN_MODEL cost fact rather than a zero.
  let costFacts = await app.costFacts.findAllByProjectId(project.id);
  for (let i = 0; i < 100 && costFacts.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 20));
    costFacts = await app.costFacts.findAllByProjectId(project.id);
  }
  expect(costFacts).toHaveLength(1);
  expect(costFacts[0]).toMatchObject({
    status: 'UNKNOWN_MODEL',
    amount: null,
    customerId: 'cust_42',
  });
});
