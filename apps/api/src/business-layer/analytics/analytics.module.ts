import { Module } from '@nestjs/common';

import { CostFactEntityModule } from '../../data-access-layer/cost-fact-entity/cost-fact.entity.module.js';
import { ProjectEntityModule } from '../../data-access-layer/project-entity/project.entity.module.js';
import { AnalyticsController } from './controllers/analytics.controller.js';
import { AnalyticsService } from './services/analytics.service.js';

@Module({
  imports: [ProjectEntityModule, CostFactEntityModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
