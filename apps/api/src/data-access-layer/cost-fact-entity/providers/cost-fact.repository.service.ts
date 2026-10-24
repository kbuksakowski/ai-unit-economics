import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { asInsertable, isDuplicateKeyError } from '../../../utils/typeorm.util.js';
import { CostFactEntity } from '../entities/cost-fact.entity.js';
import type {
  CostFactForCorrection,
  CostFactGrouping,
  CostFactSumForGroup,
  CostFactTotalsRow,
  NewCostFact,
} from '../types/cost-fact.type.js';

// MariaDB rejects an aggregate's alias inside an ORDER BY expression, so it is repeated.
const PRICED_AMOUNT_SQL = "SUM(CASE WHEN costFact.status = 'PRICED' THEN costFact.amount END)";

// A whitelist, never a caller-supplied column name.
const GROUP_COLUMN: Record<CostFactGrouping, string> = {
  customer: 'costFact.customer_id',
  feature: 'costFact.feature',
};

// Insert-only and project-scoped; see ../../INVARIANTS.md.
@Injectable()
export class CostFactRepositoryService {
  constructor(
    @InjectRepository(CostFactEntity)
    private readonly _costFactRepository: Repository<CostFactEntity>,
  ) {}

  /** Revision 1. `duplicate` when another worker priced this usage fact first. */
  async insertInitial(projectId: string, fact: NewCostFact): Promise<'created' | 'duplicate'> {
    return this.insert(projectId, fact, { revision: 1, supersedesId: null, reason: 'INITIAL' });
  }

  /** Appends a revision that replaces `previous`; the previous row is never touched (ADR-0009). */
  async insertCorrection(
    projectId: string,
    previous: CostFactForCorrection,
    fact: NewCostFact,
  ): Promise<'created' | 'duplicate'> {
    return this.insert(projectId, fact, {
      revision: previous.revision + 1,
      supersedesId: previous.id,
      reason: 'PRICING_CORRECTION',
    });
  }

  /**
   * Sums current facts — those no correction supersedes (ADR-0009) — in `[from, to)`. Only PRICED
   * facts enter the amount; the rest are counted, never added as zero (ADR-0010). Summed in
   * the database on DECIMAL, so the result is exact. Returns up to `limit` groups.
   */
  async sumCurrentByGroup(
    projectId: string,
    grouping: CostFactGrouping,
    from: Date,
    to: Date,
    limit: number,
  ): Promise<CostFactSumForGroup[]> {
    const column = GROUP_COLUMN[grouping];
    return this._costFactRepository
      .createQueryBuilder('costFact')
      .leftJoin('cost_facts', 'successor', 'successor.supersedes_id = costFact.id')
      .select(`${column}`, 'groupKey')
      .addSelect('costFact.currency', 'currency')
      .addSelect(
        "SUM(CASE WHEN costFact.status = 'PRICED' THEN costFact.amount END)",
        'pricedAmount',
      )
      .addSelect("SUM(costFact.status = 'PRICED')", 'pricedEvents')
      .addSelect("SUM(costFact.status <> 'PRICED')", 'leftOutEvents')
      .where('costFact.project_id = :projectId', { projectId })
      .andWhere('successor.id IS NULL')
      .andWhere('costFact.occurred_at >= :from AND costFact.occurred_at < :to', { from, to })
      .groupBy(column)
      .addGroupBy('costFact.currency')
      .orderBy(`${PRICED_AMOUNT_SQL} IS NULL`, 'ASC')
      .addOrderBy('pricedAmount', 'DESC')
      .addOrderBy('groupKey', 'ASC')
      .limit(limit)
      .getRawMany<CostFactSumForGroup>();
  }

  /**
   * Totals of current facts in `[from, to)` by status, attribution and currency, with the
   * tokens of their usage facts — the raw material of the completeness overview (ADR-0010).
   */
  async totalsCurrentByStatus(
    projectId: string,
    from: Date,
    to: Date,
  ): Promise<CostFactTotalsRow[]> {
    return this._costFactRepository
      .createQueryBuilder('costFact')
      .leftJoin('cost_facts', 'successor', 'successor.supersedes_id = costFact.id')
      .innerJoin('usage_facts', 'usageFact', 'usageFact.id = costFact.usage_fact_id')
      .select('costFact.status', 'status')
      .addSelect('costFact.attribution_status', 'attributionStatus')
      .addSelect('costFact.currency', 'currency')
      .addSelect('SUM(costFact.amount)', 'amount')
      .addSelect('COUNT(*)', 'events')
      .addSelect('SUM(usageFact.input_tokens + usageFact.output_tokens)', 'tokens')
      .where('costFact.project_id = :projectId', { projectId })
      .andWhere('successor.id IS NULL')
      .andWhere('costFact.occurred_at >= :from AND costFact.occurred_at < :to', { from, to })
      .groupBy('costFact.status')
      .addGroupBy('costFact.attribution_status')
      .addGroupBy('costFact.currency')
      .getRawMany<CostFactTotalsRow>();
  }

  /** "Current" is derived: the facts no other fact supersedes. Full rows, for inspection. */
  async findCurrentByProjectId(projectId: string): Promise<CostFactEntity[]> {
    return this._costFactRepository
      .createQueryBuilder('costFact')
      .leftJoin('cost_facts', 'successor', 'successor.supersedes_id = costFact.id')
      .where('costFact.projectId = :projectId', { projectId })
      .andWhere('successor.id IS NULL')
      .orderBy('costFact.id', 'ASC')
      .getMany();
  }

  // Full rows on purpose, for inspection in tests. Product reads use projections.
  async findAllByProjectId(projectId: string): Promise<CostFactEntity[]> {
    return this._costFactRepository.find({ where: { projectId }, order: { id: 'ASC' } });
  }

  private async insert(
    projectId: string,
    fact: NewCostFact,
    revision: Pick<CostFactEntity, 'revision' | 'supersedesId' | 'reason'>,
  ): Promise<'created' | 'duplicate'> {
    // A caller spreading an existing row would otherwise carry its id into the insert.
    const {
      id: _id,
      createdAt: _createdAt,
      ...columns
    } = fact as NewCostFact & Partial<Pick<CostFactEntity, 'id' | 'createdAt'>>;
    try {
      await this._costFactRepository.insert(
        asInsertable(new CostFactEntity({ ...columns, ...revision, projectId })),
      );
      return 'created';
    } catch (error) {
      if (isDuplicateKeyError(error)) return 'duplicate';
      throw error;
    }
  }
}
