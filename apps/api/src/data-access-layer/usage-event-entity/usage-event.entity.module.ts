import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UsageEventEntity } from './entities/usage-event.entity.js';
import { UsageEventRepositoryService } from './providers/usage-event.repository.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([UsageEventEntity])],
  providers: [UsageEventRepositoryService],
  exports: [UsageEventRepositoryService],
})
export class UsageEventEntityModule {}
