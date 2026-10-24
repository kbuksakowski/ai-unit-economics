import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RejectedEventEntity } from './entities/rejected-event.entity.js';
import { RejectedEventRepositoryService } from './providers/rejected-event.repository.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([RejectedEventEntity])],
  providers: [RejectedEventRepositoryService],
  exports: [RejectedEventRepositoryService],
})
export class RejectedEventEntityModule {}
