# ADR-0004: SDK construction and dependencies

- Date: 2026-08-31
- Status: Accepted, amended 2026-10-03 by ADR-0008

## Context

The SDK runs inside other companies' production applications. Its dependency footprint
and its failure behaviour are product constraints, not preferences. The hard requirement:
a failure in our code must never break, or measurably slow, the host's call to its AI
provider.

Reading how four comparable libraries wrap provider SDKs surfaced several traps that are
not obvious from the outside.

## Decision

**Zero runtime dependencies.** `packages/contracts` is a devDependency. Its types are
used internally and never appear in the SDK's public surface, so the published `dist` does
not reference it and the package is self-contained (ADR-0008). UUIDv7 is
implemented inline — Node has no built-in, and `crypto.randomUUID()` is v4 only.

**Wrap the returned promise with the provider SDK's own `_thenUnwrap`.** Both the
Anthropic and OpenAI Node SDKs are Stainless-generated and expose it. Rebuilding a facade
breaks `instanceof`; proxying an empty object makes the request lazy and silently removes
concurrency.

**Close instrumentation in `finally`.** Two comparable libraries leak instrumentation when
the caller breaks out of a stream early or the promise rejects, reporting nothing at all
for those calls.

**Swallow every internal exception.** Nothing this SDK does may surface in the host
application. The SDK exposes `onError?: (error) => void`, defaulting to a no-op, as the
only channel for reporting its own problems.

**Validate the two fields the user supplies, cheaply and without a dependency.** Telemetry
is fire-and-forget, so a malformed `customerId` silently produces wrong data indefinitely
and the caller never learns. A length check on `customerId` and `feature`, reported through
`onError`, closes that gap for nothing. Full validation of the wire contract stays on the
server, which remains the authority.

**If serialising the provider's usage object fails**, drop the field and mark the event
`usageStatus: 'not_reported'`. Never throw.

**Send without awaiting**, with a timeout, and the promise voided with a `catch`.

Streaming is not implemented in this release, but `track()` accepts a function returning
anything, so stream detection can arrive later without changing the signature.

## Consequences

Fire-and-forget adds no latency to the host's call, which is the hard requirement. The
cost is that events can be lost on abrupt process exit. This is documented and addressed
in M4 by buffering and a shutdown flush.

Inlining types at build time means the release pipeline must bundle declarations, not just
compile them. _Amended 2026-10-03 (ADR-0008):_ no bundling — contract types stay out of the
SDK's public surface instead, so plain `tsc` output is self-contained.

## Alternatives rejected

**Schema validation (zod) in the SDK.** Pulls a runtime dependency into the customer's
production tree. Validation belongs on the server.

**`Proxy` around the returned object.** Verified empirically to be bypassed by `.tee()`
and `.toReadableStream()`, which reach private internals. In-place mutation plus an
override of `tee()` is what actually covers every consumption path.

**Awaiting the send.** Puts our availability on the host's critical path.

**A queue in the first release.** Correct eventually, but it is a milestone of its own and
would delay the first end-to-end slice.
