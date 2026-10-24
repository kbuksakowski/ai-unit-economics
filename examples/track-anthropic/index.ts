/**
 * One real Anthropic call, tracked by the SDK and delivered to your API.
 *
 *   ANTHROPIC_API_KEY=...        your Anthropic key, read by @anthropic-ai/sdk
 *   AIUE_INGESTION_KEY=...       a project's ingestion key (seed-demo writes one to .env.demo)
 *   AIUE_API_URL=...             defaults to http://127.0.0.1:3000
 *
 *   node examples/track-anthropic/index.ts [customer-id] [model]
 *
 * Needs Node 24+, which runs this file directly by stripping the types; older Node fails
 * with ERR_UNKNOWN_FILE_EXTENSION before any of this code runs. Run `nvm use` first.
 */
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@ai-unit-economics/sdk';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set`);
    process.exit(1);
  }
  return value;
}

const economics = createClient({
  apiKey: required('AIUE_INGESTION_KEY'),
  baseUrl: process.env.AIUE_API_URL ?? 'http://127.0.0.1:3000',
  onError: (diagnostic) =>
    console.error(`[ai-unit-economics] ${diagnostic.code}: ${diagnostic.message}`),
});
const anthropic = new Anthropic({ apiKey: required('ANTHROPIC_API_KEY') });
const customerId = process.argv[2] ?? 'first-real-call';
const model = process.argv[3] ?? 'claude-haiku-4-5';

// The provider call is unchanged; track() only observes what comes back.
const message = await economics.track(
  () =>
    anthropic.messages.create({
      model,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Reply with the single word: hello' }],
    }),
  { customerId, feature: 'example' },
);

const text = message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
console.log(`model:      ${message.model}`);
console.log(`reply:      ${text.trim()}`);
console.log(`usage:      ${JSON.stringify(message.usage)}`);
console.log(`request id: ${message._request_id ?? 'none'}`);
console.log(`tracked for customer "${customerId}"; the delivery finishes before the process exits`);
