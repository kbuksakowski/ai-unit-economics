# ADR-0011: Dashboard

- Date: 2026-10-03
- Status: Accepted
- Related: ADR-0005, ADR-0010

## Context

The dashboard shows which customers are expensive — commercially confidential data — and it
must not present a figure as more complete or more precise than it is.

## Decision

**The read key never reaches the browser.** Pages render on the Next.js server, which holds
the key in its environment; the browser receives HTML.

**HTTP Basic on every request, required.** With the key on the server, the dashboard's URL
would otherwise open the data to anyone on the network. Without configured credentials the
dashboard refuses to serve rather than run open. Accounts and roles come later.

**The dashboard depends on `contracts` only, never on `core`.** It therefore does not add
amounts itself; totals come from the API (ADR-0010).

**Amounts are shown exactly as the API returns them.** A fraction of a cent rounded to
$0.00 reads as free. No amount reads "not priced", never $0.

**The gap figures sit at the top of the page, not in settings.** They are the product.

## Consequences

The dashboard needs `AIUE_API_URL`, `AIUE_READ_KEY`, `DASHBOARD_USER` and
`DASHBOARD_PASSWORD`. The Docker demo profile sets public demo values, for local use only.
