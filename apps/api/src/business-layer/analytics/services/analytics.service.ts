import {
  costOverviewQuerySchema,
  costSummaryQuerySchema,
  MAX_COST_SUMMARY_GROUPS,
  type CostOverviewResponse,
  type CostSummaryResponse,
} from '@ai-unit-economics/contracts';
import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';

import { CostFactRepositoryService } from '../../../data-access-layer/cost-fact-entity/providers/cost-fact.repository.service.js';
import { mapCostFactTotalsToOverview } from '../utils/analytics-overview.util.js';
import { mapCostFactSumToCostSummaryGroup } from '../utils/analytics.util.js';

@Injectable()
export class AnalyticsService {
  constructor(private readonly _costFactRepositoryService: CostFactRepositoryService) {}

  // Summed in the database over the whole range — never from the capped summary (ADR-0010).
  async getCostOverview(projectId: string, rawQuery: unknown): Promise<CostOverviewResponse> {
    const query = costOverviewQuerySchema.safeParse(rawQuery);
    if (!query.success) throw new BadRequestException(z.prettifyError(query.error));
    const { from, to } = query.data;
    const rows = await this._costFactRepositoryService.totalsCurrentByStatus(
      projectId,
      new Date(from),
      new Date(to),
    );
    return mapCostFactTotalsToOverview(rows, { from, to });
  }

  async getCostSummary(projectId: string, rawQuery: unknown): Promise<CostSummaryResponse> {
    const query = costSummaryQuerySchema.safeParse(rawQuery);
    if (!query.success) throw new BadRequestException(z.prettifyError(query.error));
    const { groupBy, from, to } = query.data;

    // One extra row tells whether the cap cut anything off.
    const rows = await this._costFactRepositoryService.sumCurrentByGroup(
      projectId,
      groupBy,
      new Date(from),
      new Date(to),
      MAX_COST_SUMMARY_GROUPS + 1,
    );
    return {
      groupBy,
      from,
      to,
      groups: rows.slice(0, MAX_COST_SUMMARY_GROUPS).map(mapCostFactSumToCostSummaryGroup),
      truncated: rows.length > MAX_COST_SUMMARY_GROUPS,
    };
  }
}
