import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { asInsertable } from '../../../utils/typeorm.util.js';
import { RejectedEventEntity } from '../entities/rejected-event.entity.js';
import type { NewRejectedEvent } from '../types/rejected-event.type.js';

// Insert-only and project-scoped by construction; see ../../INVARIANTS.md.
@Injectable()
export class RejectedEventRepositoryService {
  constructor(
    @InjectRepository(RejectedEventEntity)
    private readonly _rejectedEventRepository: Repository<RejectedEventEntity>,
  ) {}

  async insert(projectId: string, event: NewRejectedEvent): Promise<void> {
    await this._rejectedEventRepository.insert(
      asInsertable(new RejectedEventEntity({ ...event, projectId })),
    );
  }

  // Full rows on purpose, for inspection in tests. Product reads use projections.
  async findAllByProjectId(projectId: string): Promise<RejectedEventEntity[]> {
    return this._rejectedEventRepository.find({ where: { projectId }, order: { id: 'ASC' } });
  }
}
