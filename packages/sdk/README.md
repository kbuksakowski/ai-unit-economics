# @ai-unit-economics/sdk

Attribute the cost of each AI call to the customer and feature that caused it.

The SDK wraps your existing provider call. The request still goes straight to the provider;
the SDK observes the response and reports the provider's usage object to **your own**
AI Unit Economics API. It never sees prompts, model output or your provider API key.

> **Pre-release (0.1.0-alpha).** Anthropic only. The API may change before 1.0. ESM only;
> Node 22.13 or newer.

```sh
npm install @ai-unit-economics/sdk
```

```ts
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@ai-unit-economics/sdk';

const economics = createClient({
  apiKey: process.env.AIUE_INGESTION_KEY!, // a project's ingestion key, aiue_live_...
  baseUrl: 'http://localhost:3000', // your self-hosted API
});
const anthropic = new Anthropic();

const message = await economics.track(
  () => anthropic.messages.create({ model: 'claude-haiku-4-5', max_tokens: 1024, messages }),
  { customerId: 'acme', feature: 'invoice-parser' },
);
```

`track()` returns the provider SDK's own promise, so `withResponse()` keeps working and the
resolved message keeps `_request_id`. Only message creation is recorded; token counting,
list endpoints and other providers' SDKs pass through untouched.

## Guarantees

- **Fail-open.** If your API is down, slow or rejecting events, the provider call still
  succeeds. Delivery has a timeout (default 2 s), is never awaited by your code, and at most
  32 deliveries are in flight at once — the excess is dropped and reported, so an unreachable
  API cannot pile up sockets in your process.
- **A broken setup does not crash your app.** A missing `apiKey` or `baseUrl` reports
  `invalid_config` once and leaves tracking disabled.
- **`onError` cannot hurt you either.** A throwing or rejecting `onError` is caught.
- **Provider errors are untouched.** An exception from the provider reaches you as thrown.
- **Zero runtime dependencies.**
- **Raw usage, no interpretation.** The server normalises and prices it and keeps the
  original, so a pricing or normalisation fix can be applied to history later.

## Options

| Option      | Default | Meaning                                                           |
| ----------- | ------- | ----------------------------------------------------------------- |
| `apiKey`    | —       | The project's ingestion key                                       |
| `baseUrl`   | —       | Your API; use `https://` unless it runs on the same machine       |
| `timeoutMs` | `2000`  | Per delivery attempt                                              |
| `onError`   | no-op   | Receives `{ code, message, cause? }`; the SDK's only side channel |
| `enabled`   | `true`  | When `false`, `track()` calls your function and nothing else      |

`onError` codes:

| Code                   | When                                                                          |
| ---------------------- | ----------------------------------------------------------------------------- |
| `delivery_failed`      | An event did not reach your API (down, slow, rejected, or too many in flight) |
| `invalid_customer_id`  | A `customerId` was not a 1–256 character string; once per client              |
| `invalid_feature`      | The same for `feature`; once per client                                       |
| `stream_not_supported` | A streaming call was passed through unmeasured; once per client               |
| `invalid_config`       | `apiKey`, `baseUrl` or `timeoutMs` is invalid; tracking is disabled           |
| `insecure_transport`   | `baseUrl` is plain `http://` to another machine                               |

## Known limitations

- Streaming responses pass through untouched. `messages.create({ stream: true })` is reported
  as **not measured**, never as zero; `messages.stream()` is not reported at all yet.
- There are no retries yet: an event is lost if delivery fails or the process exits
  mid-send. In short-lived environments such as AWS Lambda, events can be lost when the
  function freezes.
- A provider call that throws is not reported.

Licensed under Apache-2.0.
