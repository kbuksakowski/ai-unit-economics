import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CostFactEntity } from './entities/cost-fact.entity.js';
import { CostFactRepositoryService } from './providers/cost-fact.repository.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([CostFactEntity])],
  providers: [CostFactRepositoryService],
  exports: [CostFactRepositoryService],
})
export class CostFactEntityModule {}
