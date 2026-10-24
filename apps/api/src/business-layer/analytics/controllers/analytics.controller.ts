import type { CostOverviewResponse, CostSummaryResponse } from '@ai-unit-economics/contracts';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { ProjectId } from '../../../decorators/project-id.decorator.js';
import { ReadKeyGuard } from '../../../guards/read-key.guard.js';
import { AnalyticsService } from '../services/analytics.service.js';

@Controller('v1/costs')
export class AnalyticsController {
  constructor(private readonly _analyticsService: AnalyticsService) {}

  @Get('overview')
  @UseGuards(ReadKeyGuard)
  async getCostOverview(
    @ProjectId() projectId: string,
    @Query() query: unknown,
  ): Promise<CostOverviewResponse> {
    return this._analyticsService.getCostOverview(projectId, query);
  }

  @Get('summary')
  @UseGuards(ReadKeyGuard)
  async getCostSummary(
    @ProjectId() projectId: string,
    @Query() query: unknown,
  ): Promise<CostSummaryResponse> {
    return this._analyticsService.getCostSummary(projectId, query);
  }
}
