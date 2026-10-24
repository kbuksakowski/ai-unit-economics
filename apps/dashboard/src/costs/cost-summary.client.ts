import {
  costOverviewResponseSchema,
  costSummaryResponseSchema,
  type CostOverviewResponse,
  type CostSummaryGroupBy,
  type CostSummaryResponse,
} from '@ai-unit-economics/contracts';
import type { DashboardConfig } from '../config/dashboard.config';

/** The one method needed from a contract schema; avoids a direct dependency on zod. */
interface ResponseSchema<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false };
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string };
export type CostSummaryResult = ApiResult<CostSummaryResponse>;
export type CostOverviewResult = ApiResult<CostOverviewResponse>;

export function fetchCostSummary(
  config: DashboardConfig,
  query: { groupBy: CostSummaryGroupBy; from: string; to: string },
  fetchImpl: typeof fetch = fetch,
): Promise<CostSummaryResult> {
  return fetchFromApi(config, '/v1/costs/summary', query, costSummaryResponseSchema, fetchImpl);
}

export function fetchCostOverview(
  config: DashboardConfig,
  query: { from: string; to: string },
  fetchImpl: typeof fetch = fetch,
): Promise<CostOverviewResult> {
  return fetchFromApi(config, '/v1/costs/overview', query, costOverviewResponseSchema, fetchImpl);
}

/**
 * Every failure becomes a message on the page. An empty table on error would read as
 * "nothing cost anything", which is the one wrong answer this product must not give.
 */
async function fetchFromApi<T>(
  config: DashboardConfig,
  path: string,
  query: Record<string, string>,
  schema: ResponseSchema<T>,
  fetchImpl: typeof fetch,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetchImpl(`${config.apiUrl}${path}?${new URLSearchParams(query)}`, {
      headers: { authorization: `Bearer ${config.readKey}` },
      cache: 'no-store',
    });
  } catch {
    return { ok: false, message: `The API at ${config.apiUrl} is unreachable.` };
  }
  if (response.status === 401) {
    return { ok: false, message: 'The API rejected the read key (AIUE_READ_KEY).' };
  }
  if (!response.ok) {
    return { ok: false, message: `The API answered ${response.status}.` };
  }
  const parsed = schema.safeParse(await response.json());
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, message: 'The API answered in a shape this dashboard does not understand.' };
}
