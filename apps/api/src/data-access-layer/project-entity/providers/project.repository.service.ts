import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { ProjectEntity } from '../entities/project.entity.js';
import type { ProjectForKeyAuth } from '../types/project.type.js';

// The one table not scoped by project: it is how a project is found.
@Injectable()
export class ProjectRepositoryService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly _projectRepository: Repository<ProjectEntity>,
  ) {}

  // Each key resolves through its own column, so neither can stand in for the other (ADR-0005).
  async findForIngestionKeyAuth(apiKeyHash: string): Promise<ProjectForKeyAuth | null> {
    return this._projectRepository
      .createQueryBuilder('project')
      .select(['project.id'])
      .where('project.apiKeyHash = :apiKeyHash', { apiKeyHash })
      .getOne() as Promise<ProjectForKeyAuth | null>;
  }

  async findForReadKeyAuth(readKeyHash: string): Promise<ProjectForKeyAuth | null> {
    return this._projectRepository
      .createQueryBuilder('project')
      .select(['project.id'])
      .where('project.readKeyHash = :readKeyHash', { readKeyHash })
      .getOne() as Promise<ProjectForKeyAuth | null>;
  }

  async insert(name: string, apiKeyHash: string, readKeyHash: string): Promise<string> {
    const result = await this._projectRepository.insert(
      new ProjectEntity({ name, apiKeyHash, readKeyHash }),
    );
    return String(result.identifiers[0]!.id);
  }
}
