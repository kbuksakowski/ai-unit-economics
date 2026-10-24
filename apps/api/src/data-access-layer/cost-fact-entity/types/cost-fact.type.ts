import type { CostFactEntity } from '../entities/cost-fact.entity.js';

export type NewCostFact = Omit<
  CostFactEntity,
  'id' | 'projectId' | 'revision' | 'supersedesId' | 'reason' | 'createdAt'
>;

export type CostFactForCorrection = Pick<CostFactEntity, 'id' | 'usageFactId' | 'revision'>;

export type CostFactGrouping = 'customer' | 'feature';

/** One status/attribution/currency bucket; DECIMAL and counts arrive as strings. */
export interface CostFactTotalsRow {
  status: string;
  attributionStatus: string;
  currency: string;
  amount: string | null;
  events: string;
  /** Input plus output tokens of the usage facts; null when none was readable. */
  tokens: string | null;
}

/** One summary group as the database returns it: DECIMAL and counts arrive as strings. */
export interface CostFactSumForGroup {
  groupKey: string | null;
  currency: string;
  pricedAmount: string | null;
  pricedEvents: string;
  leftOutEvents: string;
}
