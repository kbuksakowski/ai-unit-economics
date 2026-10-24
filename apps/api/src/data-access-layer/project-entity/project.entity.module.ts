import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProjectEntity } from './entities/project.entity.js';
import { ProjectRepositoryService } from './providers/project.repository.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ProjectEntity])],
  providers: [ProjectRepositoryService],
  exports: [ProjectRepositoryService],
})
export class ProjectEntityModule {}
