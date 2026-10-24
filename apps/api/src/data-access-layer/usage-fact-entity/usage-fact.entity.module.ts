import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UsageFactEntity } from './entities/usage-fact.entity.js';
import { UsageFactRepositoryService } from './providers/usage-fact.repository.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([UsageFactEntity])],
  providers: [UsageFactRepositoryService],
  exports: [UsageFactRepositoryService],
})
export class UsageFactEntityModule {}
