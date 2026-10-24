# ADR-0003: Event identity and idempotency

- Date: 2026-08-31
- Status: Accepted

## Context

Telemetry is retried. A retry must not bill twice. Separately, a usage event may later
need correcting, which requires a stable identity distinct from the delivery attempt.

## Decision

Two identifiers, both UUIDv7, both generated in the SDK at call time:

- `idempotencyKey` — identifies the **delivery**. A retry reuses the same value.
- `usageEventId` — identifies the **usage**. Survives corrections.

In the first release both carry the same value. The distinction is free now and
impossible to introduce later without breaking the contract.

Deduplication is a permanent unique index on `(projectId, idempotencyKey)`. No time
window, no external store.

**The timestamp is never part of the deduplication key.**

UUIDv7 rather than v4 because it is time-ordered, so insertion does not fragment the
InnoDB index.

## Consequences

Idempotency is enforced by the database, not by application code, so it holds under
concurrent replicas — a failure mode documented in a comparable product, where two
workers both incremented spend before either wrote a dedup flag.

A permanent index grows without bound. Acceptable at the scale this release targets, and
revisitable without changing the contract.

Because both identifiers come from the client, a client that regenerates them on retry
defeats deduplication. The SDK owns this and must not.

## Alternatives rejected

**One identifier for both roles.** Makes later correction of an event impossible without
a contract change.

**Content-derived identifier (hash of the request).** Two genuinely distinct calls with
identical inputs would collapse into one.

**Server-generated identifier.** The server cannot recognise a retry.

**Deduplication window in Redis.** Another moving part, and a window shorter than a
billing cycle is useless when replaying data. One comparable product defaults to 32 days
and concedes at-least-once semantics beyond it.

**Timestamp in the dedup key.** Documented bug in a comparable product: a retry that
recomputes the timestamp becomes a second billable event.
