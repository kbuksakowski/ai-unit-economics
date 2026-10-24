import type { CostSummaryGroupBy } from '@ai-unit-economics/contracts';
import type { ReactNode } from 'react';

import { loadDashboardConfig } from '../src/config/dashboard.config';
import {
  fetchCostOverview,
  fetchCostSummary,
  type CostOverviewResult,
  type CostSummaryResult,
} from '../src/costs/cost-summary.client';
import { resolveDateRange } from '../src/costs/date-range';
import { formatAmount, formatGroupKey } from '../src/costs/format';
import {
  countPricedEvents,
  describeNotPricedReasons,
  describeNotPricedTokens,
  formatCount,
  formatPricedTotals,
} from '../src/costs/overview';

// Rendered per request on the server: the data is live and the read key stays here (ADR-0011).
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ from?: string | string[]; to?: string | string[] }>;
}

export default async function OverviewPage({ searchParams }: PageProps) {
  const range = resolveDateRange(await searchParams);
  const config = loadDashboardConfig();
  const query = { from: range.from, to: range.to };
  const [overview, byCustomer, byFeature] = await Promise.all([
    fetchCostOverview(config, query),
    fetchCostSummary(config, { ...query, groupBy: 'customer' }),
    fetchCostSummary(config, { ...query, groupBy: 'feature' }),
  ]);

  return (
    <main>
      <h1>AI cost</h1>
      <form method="get" className="range">
        <label>
          From <input type="date" name="from" defaultValue={range.fromDate} />
        </label>
        <label>
          To <input type="date" name="to" defaultValue={range.toDate} />
        </label>
        <button type="submit">Show</button>
        <span className="hint">
          {range.fromDate} to {range.toDate}, inclusive, UTC
        </span>
      </form>
      <Overview result={overview} />
      <CostTable title="Cost per customer" groupBy="customer" result={byCustomer} />
      <CostTable title="Cost per feature" groupBy="feature" result={byFeature} />
    </main>
  );
}

/**
 * What the cost covers, then three separate numbers for what it does not (ADR-0010). On top,
 * not in settings: these numbers are the product (ADR-0011).
 */
function Overview({ result }: { result: CostOverviewResult }) {
  if (!result.ok) {
    return (
      <p className="error" role="alert">
        {result.message}
      </p>
    );
  }
  const { priced, unattributed, notPriced, notMeasured } = result.data;
  return (
    <dl className="overview">
      <Metric label="Cost" value={formatPricedTotals(priced)}>
        from {formatCount(countPricedEvents(priced))} priced events
      </Metric>
      <Metric
        label="Unattributed"
        value={formatPricedTotals(unattributed.priced)}
        warn={unattributed.events > 0}
      >
        {formatCount(unattributed.events)} events without a customer
      </Metric>
      <Metric
        label="Not priced"
        value={`${formatCount(notPriced.events)} events`}
        warn={notPriced.events > 0}
      >
        {notPriced.events > 0
          ? `${describeNotPricedTokens(notPriced)} · ${describeNotPricedReasons(notPriced)}`
          : 'every measured event has a price'}
      </Metric>
      <Metric
        label="Not measured"
        value={`${formatCount(notMeasured.events)} events`}
        warn={notMeasured.events > 0}
      >
        calls that reported no usage, such as streams
      </Metric>
    </dl>
  );
}

function Metric({
  label,
  value,
  warn = false,
  children,
}: {
  label: string;
  value: string;
  warn?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="metric">
      <dt>{label}</dt>
      <dd className={warn ? 'value warn' : 'value'}>{value}</dd>
      <dd className="hint">{children}</dd>
    </div>
  );
}

function CostTable({
  title,
  groupBy,
  result,
}: {
  title: string;
  groupBy: CostSummaryGroupBy;
  result: CostSummaryResult;
}) {
  if (!result.ok) {
    return (
      <section>
        <h2>{title}</h2>
        <p className="error" role="alert">
          {result.message}
        </p>
      </section>
    );
  }
  const { groups, truncated } = result.data;
  return (
    <section>
      <h2>{title}</h2>
      {groups.length === 0 ? (
        <p className="empty">No usage recorded in this range.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{groupBy === 'customer' ? 'Customer' : 'Feature'}</th>
              <th className="number">Cost</th>
              <th className="number">Priced events</th>
              <th className="number" title="Events not in the cost: not priced or not measured">
                Left out
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={`${group.key ?? ''}|${group.currency}`}>
                <td className={group.key === null ? 'muted' : undefined}>
                  {formatGroupKey(group.key, groupBy)}
                </td>
                <td className={group.amount === null ? 'number muted' : 'number'}>
                  {formatAmount(group.amount, group.currency)}
                </td>
                <td className="number">{group.pricedEvents}</td>
                <td className={group.leftOutEvents > 0 ? 'number warn' : 'number'}>
                  {group.leftOutEvents}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {truncated && <p className="hint">Showing the 500 most expensive; more exist.</p>}
    </section>
  );
}
