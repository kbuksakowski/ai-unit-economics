import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { asInsertable, isDuplicateKeyError } from '../../../utils/typeorm.util.js';
import { UsageEventEntity } from '../entities/usage-event.entity.js';
import type {
  NewUsageEvent,
  UsageEventForDerivation,
  UsageEventInsertOutcome,
} from '../types/usage-event.type.js';

// Insert-only and project-scoped by construction; see ../../INVARIANTS.md.
@Injectable()
export class UsageEventRepositoryService {
  constructor(
    @InjectRepository(UsageEventEntity)
    private readonly _usageEventRepository: Repository<UsageEventEntity>,
  ) {}

  // The unique index decides, not a prior read, so concurrent replicas cannot both insert (ADR-0003).
  async insert(projectId: string, event: NewUsageEvent): Promise<UsageEventInsertOutcome> {
    try {
      await this._usageEventRepository.insert(
        asInsertable(new UsageEventEntity({ ...event, projectId })),
      );
      return 'created';
    } catch (error) {
      if (isDuplicateKeyError(error)) return 'duplicate';
      throw error;
    }
  }

  // Cross-project by design: background derivation, never reachable from a request (ADR-0009).
  async findWithoutUsageFactAcrossProjects(limit: number): Promise<UsageEventForDerivation[]> {
    return this._usageEventRepository
      .createQueryBuilder('usageEvent')
      .leftJoin('usage_facts', 'usageFact', 'usageFact.usage_event_id = usageEvent.id')
      .select([
        'usageEvent.id',
        'usageEvent.projectId',
        'usageEvent.provider',
        'usageEvent.usageStatus',
        'usageEvent.rawUsage',
        'usageEvent.respondedModel',
        'usageEvent.customerId',
        'usageEvent.feature',
        'usageEvent.occurredAt',
      ])
      .where('usageFact.id IS NULL')
      .orderBy('usageEvent.id', 'ASC')
      .limit(limit)
      .getMany() as Promise<UsageEventForDerivation[]>;
  }

  // Full rows on purpose, for inspection in tests. Product reads use projections.
  async findAllByProjectId(projectId: string): Promise<UsageEventEntity[]> {
    return this._usageEventRepository.find({ where: { projectId }, order: { id: 'ASC' } });
  }
}
