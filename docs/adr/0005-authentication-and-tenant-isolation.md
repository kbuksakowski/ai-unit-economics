# ADR-0005: Authentication and tenant isolation

- Date: 2026-08-31
- Status: Accepted, amended 2026-10-03

## Context

The ingestion API accepts data attributed to a customer's end users. Attribution data is
commercially confidential: it reveals which of their customers are expensive. A
comparable product shipped an endpoint that exposed cross-tenant spend to any
authenticated key.

## Decision

`Authorization: Bearer aiue_live_<32 random bytes, base58>`.

Keys are stored as a SHA-256 digest. Not a password hashing function: the key carries 256
bits of entropy, so a deliberately slow derivation buys nothing and costs latency on every
request.

The literal `aiue_live_` prefix stays in plaintext so a leaked key is recognisable in logs
and by secret scanners.

`projectId` is on every fact row. Scoping is applied **in the repository layer**, not
per-endpoint.

No user accounts, no roles, no key rotation in this release. One key per project.

_Amended 2026-10-03:_ two keys per project. The ingestion key above lives in the
environment of the customer's application servers; a separate read key,
`aiue_read_<32 random bytes, base58>`, opens the analytics endpoints and nothing else. Neither
key works in the other's place. Otherwise anyone with access to an application server could
read which customers are expensive — the exact leak this ADR exists to prevent.

## Consequences

Repository-level scoping means a new endpoint cannot forget to filter. That is the
specific failure that leaked cross-tenant data elsewhere, and per-endpoint discipline is
not a control.

No rotation means a leaked key requires issuing a new project. Acceptable for a first
release; a real gap before anyone runs this in production at scale.

## Alternatives rejected

**Argon2 or bcrypt for key storage.** Designed for low-entropy secrets; pure cost here.

**A key per end customer.** Multiplies credentials to solve a problem already solved by a
field on the event.

**Provider API keys held by us.** Explicitly out of scope for the product.
