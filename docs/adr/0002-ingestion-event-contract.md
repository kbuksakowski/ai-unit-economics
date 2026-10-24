# ADR-0002: Ingestion event contract and envelope

- Date: 2026-08-31
- Status: Accepted

## Context

The wire format between the SDK and the ingestion API is the hardest thing to change
later, because it is installed in other companies' applications. Comparable products got
several parts of this wrong in ways their issue trackers record.

## Decision

`POST /v1/usage`, with the version in the path.

A named batch envelope on every request, even when it carries one event:

```
{ "sdk": { "name": "...", "version": "..." }, "events": [ ... ] }
```

Envelope-level problems are HTTP status codes; per-event outcomes are the response body.
A well-formed envelope always answers `200`, even when every event inside it failed.

```
200 { "successes": [ { "idempotencyKey": "...", "status": 201 } ],
      "errors":    [ { "idempotencyKey": "...", "code": "...", "message": "..." } ] }

400  malformed envelope     401/403  auth     413  payload too large
```

`status: 200` inside `successes` means the event was a duplicate: accepted, not counted
twice. `idempotencyKey` is optional inside `errors`, because an event can be malformed
enough that it cannot be read.

Unknown top-level fields are ignored, never rejected. Events failing validation are
**stored with the error attached** rather than discarded.

Three timestamps per record: the client's `occurredAt`, the server's receipt time, and
the storage time.

Event fields: `idempotencyKey`, `usageEventId`, `occurredAt`, `provider`,
`providerClient`, `requestedModel`, `respondedModel?`, `operation`, `customerId?`,
`feature?`, `status`, `errorType?`, `durationMs?`, `providerRequestId?`, `usageStatus`,
`rawUsage?`.

**The outcome of the call and the availability of a measurement are separate fields.**
`status` says whether the provider call succeeded; `usageStatus` (`reported` /
`not_reported`) says whether a usage object came back. They vary independently: a failed
call can still report usage, because providers bill for output generated before a
mid-stream failure.

This separation is load-bearing for the completeness metrics. An event with no usage to
price is not the same fact as an event whose model is missing from the price table, and
collapsing them would pollute the "unpriced" figure the product is built around.

The schema enforces the combination: `usageStatus: 'reported'` requires `rawUsage` to be
present.

`rawUsage` is typed as a JSON value, not as `unknown`. This is a wire contract, and
`unknown` admits `BigInt`, `Date`, class instances and functions — values on which
`JSON.stringify` throws. Telemetry must never throw into the host application, so the
type forbids at compile time what would otherwise fail at runtime.

`providerClient` is `{ name, version? }` rather than a bare version string. A version
number alone is meaningless once Bedrock, Vertex or a community client can produce the
same usage object. It is also a different fact from the `sdk` field in the envelope, which
identifies _our_ package.

Constants shared by SDK and server: at most 100 events per request, 1 MB body, 256
characters for `customerId` and `feature`.

There is no field for prompts or model output. Sending them is structurally impossible,
not merely discouraged.

Core telemetry field names follow the OpenTelemetry GenAI conventions where they map.
Business dimensions use our own namespace — the OTel specification explicitly forbids
prefixing custom attributes with `gen_ai.`.

## Consequences

The batch envelope costs nothing now and means SDK-side buffering (M4) will not change
the wire format. A named object rather than a bare array leaves room for request-level
fields.

Version in the path matters because under self-hosting a customer's SDK will routinely be
newer than their server. One comparable product omitted it and ended up steering
compatibility with an environment flag before deprecating the endpoint entirely.

Storing invalid events rather than dropping them means silently lost usage — the worst
failure mode for a billing-adjacent tool — cannot happen quietly.

## Alternatives rejected

**Single-event body.** Would force a format change when batching arrives.

**Bare JSON array as the batch.** No room for request-level fields such as the SDK
version.

**All-or-nothing batches.** One malformed event would discard the rest; with retries this
produces a permanent stall.

**`207 Multi-Status` for partial success.** Technically defensible and used by one
comparable product, but it originates in WebDAV and makes the API needlessly exotic for
SDKs, proxies, logs and anyone calling it by hand. Splitting envelope failures (HTTP) from
event outcomes (body) is simpler and loses nothing.

**Deriving `usageStatus` from the absence of `rawUsage`.** Would work, but conflates "the
provider returned no usage" with "the SDK could not read it" — and an explicit field costs
one enum.

**Strict rejection of unknown fields.** Blocks SDK upgrades against older servers.

**CloudEvents.** Generic field names (`subject` instead of `customerId`) and an opaque
payload, in exchange for interoperability this product does not need. Addable later as an
alternative content type; the mapping is trivial.
