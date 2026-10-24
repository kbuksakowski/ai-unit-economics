import type { CostSummaryGroup } from '@ai-unit-economics/contracts';

import type { CostFactSumForGroup } from '../../../data-access-layer/cost-fact-entity/types/cost-fact.type.js';
import { canonicalDecimal } from '../../../utils/decimal.util.js';

export function mapCostFactSumToCostSummaryGroup(row: CostFactSumForGroup): CostSummaryGroup {
  return {
    key: row.groupKey,
    currency: row.currency,
    amount: row.pricedAmount === null ? null : canonicalDecimal(row.pricedAmount),
    pricedEvents: Number(row.pricedEvents),
    leftOutEvents: Number(row.leftOutEvents),
  };
}
