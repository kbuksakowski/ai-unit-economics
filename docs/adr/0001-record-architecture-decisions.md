# ADR-0001: Record architecture decisions

- Date: 2026-08-28
- Status: Accepted

## Context

This project makes a number of decisions that are cheap now and expensive later:
package boundaries, the money representation, pricing versioning, and the telemetry
reliability model. Contributors joining later need the reasoning, not just the result.

## Decision

Technical decisions are recorded as short markdown files in `docs/adr`, numbered
sequentially and written in English. Each records context, the decision, its
consequences, and the alternatives that were rejected.

Product and business decisions are **not** recorded here; they are kept privately.

## Consequences

A change to an architectural boundary is expected to add or supersede an ADR. An accepted
ADR is not rewritten: a change of direction is a new ADR that supersedes it. A narrower
correction found during implementation — a detail that turned out wrong, without reversing
the decision — may be added in place as a dated `_Amended YYYY-MM-DD:_` note, with the
status line saying so, so the original reasoning stays readable.
