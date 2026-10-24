# ADR-0008: SDK public API and provider SDK interaction

- Date: 2026-10-03
- Status: Accepted
- Related: ADR-0004, ADR-0007

## Context

The SDK is the first link in the pipeline. Before writing it, the behaviour of `@anthropic-ai/sdk` was
established empirically rather than from documentation, because the questions that matter
— whether the caller's contract survives instrumentation, and how to test without an API
key — are not answered there.

### Verified against `@anthropic-ai/sdk` 0.124.0

| Question                                            | Finding                                                                                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Testing without a provider key                      | Works. The client accepts `baseURL`; a local HTTP server exercises the real `APIPromise` path, not a mock.                         |
| Does `_thenUnwrap` break the caller's contract      | No. It returns a genuine `APIPromise`; `withResponse()` and `asResponse()` continue to work, and the resolved object is unchanged. |
| Where `providerRequestId` comes from                | Free. `_request_id` is attached to the resolved object from the `request-id` response header.                                      |
| Detecting a stream                                  | The resolved value is a `Stream` carrying `Symbol.asyncIterator`; a `Message` does not.                                            |
| Distinguishing an `APIPromise` from a plain promise | Duck-type on `_thenUnwrap`, which exists at runtime, not only in the type declarations.                                            |

One finding was not anticipated: **`client.messages.stream()` returns a `MessageStream`
synchronously and has no `then`.** It is not a promise at all, so `track()` must survive
receiving a function that returns a non-thenable.

## Decision

### Configuration — five options, deliberately no more

```
apiKey, baseUrl, timeoutMs (2000), onError (no-op), enabled (true)
```

`enabled` is not a convenience. Without it, callers wrap `track()` in their own
conditionals and the behaviour of a disabled SDK stops being ours to define.

Deliberately absent: logger, retry and batching configuration, sampling, custom headers,
`fetch` override. The first three are M4 and freezing their shape now would be premature;
every option added is an option maintained for years.

### Four cases, all defined

```
fn() -> APIPromise<Message>        instrument via _thenUnwrap, usageStatus: reported
fn() -> APIPromise<Stream>         pass through untouched, usageStatus: not_reported
fn() -> MessageStream (sync)       pass through untouched, signal only, no event — no requested model is available
fn() -> anything else              pass through untouched, no event
```

Streaming is not consumed in this release. Crucially, a stream does **not** produce a
zero: it produces an explicit "not measured" plus a signal to the caller. Comparable
libraries silently report zero here, which is worse than reporting nothing.

### Diagnostics: one channel, structured

```
onError: (e: { code: string; message: string; cause?: unknown }) => void

'stream_not_supported'  a limitation of this release, emitted once per client instance
'invalid_customer_id'   the caller's mistake
'invalid_feature'       the caller's mistake, same check applied to `feature`
'delivery_failed'       our problem
```

An earlier draft routed the streaming limitation through `onError` as if it were an error.
Mixing a limitation with a failure in one undifferentiated channel guarantees the channel
gets muted. A code lets a caller silence the first and alert on the third.

`stream_not_supported` is emitted once per client instance, not per call. An application
that streams everything would otherwise receive it thousands of times a day and mute the
whole channel, `delivery_failed` included. Nothing is lost: every event still carries
`usageStatus: 'not_reported'`.

## Consequences

Testing can assert the properties that matter — response untouched, contract preserved,
fail-open under a dead or erroring telemetry endpoint, provider exceptions propagating
unchanged — against the real provider SDK, with no credentials and no network.

Fire-and-forget delivery means events can be lost on abrupt process exit. Documented, and
addressed in M4.

## Keeping `zod` out of the published SDK

Types in `packages/contracts` are derived with `z.infer`, so its generated `.d.ts`
reference `zod`. If the SDK's published declarations referred to those types, consumers
would need `zod` to resolve them, and "zero runtime dependencies" would stop being true.
A value import — even a constant — would be worse: it loads `contracts/index.js` and
`zod` with it at runtime.

Decision: **the SDK's public surface uses only types the SDK defines itself** — its
configuration, the options of `track()`, and the diagnostic passed to `onError`. Types
from `contracts` are used internally, with `import type`, and never appear in a public
signature. TypeScript does not emit declarations for internal-only types, so the
published `.d.ts` do not mention `contracts` at all. Verified empirically.

This holds per module, not only for the entry point: `tsc` emits a declaration file for
every module, and all of them ship. Any exported function whose signature names a
contract type leaks it. The packaging test caught exactly that during implementation
(an exported `send(event: UsageEvent)`), which is why delivery is module-private.

The one value the SDK needs, `MAX_BUSINESS_ID_LENGTH`, is duplicated in the SDK. A test
asserts it equals the value in `contracts`, so drift fails the build.

Enforcement is a test over the built `dist`: no `.js` or `.d.ts` file may import
`@ai-unit-economics/contracts` or `zod`. `verbatimModuleSyntax` alone does not do this —
it requires type-only imports to be marked, but permits value imports. Verified
empirically.

Rejected alternatives:

- **Inverting the type direction in `contracts`** (hand-written interfaces, schemas built
  to match, a compile-time equality assertion). Accepted earlier on 2026-10-03 and
  withdrawn the same day: once contract types stay out of the SDK's public surface, it
  solves nothing, while touching committed code and adding type helpers.
- **Bundling declarations at publish time.** Adds a tool and hides the problem rather
  than removing it.
