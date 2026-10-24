import { Module } from '@nestjs/common';

import { ProjectEntityModule } from '../../data-access-layer/project-entity/project.entity.module.js';
import { RejectedEventEntityModule } from '../../data-access-layer/rejected-event-entity/rejected-event.entity.module.js';
import { UsageEventEntityModule } from '../../data-access-layer/usage-event-entity/usage-event.entity.module.js';
import { IngestionController } from './controllers/ingestion.controller.js';
import { IngestionService } from './services/ingestion.service.js';

@Module({
  imports: [ProjectEntityModule, UsageEventEntityModule, RejectedEventEntityModule],
  controllers: [IngestionController],
  providers: [IngestionService],
})
export class IngestionModule {}
