import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { asInsertable, isDuplicateKeyError } from '../../../utils/typeorm.util.js';
import { UsageFactEntity } from '../entities/usage-fact.entity.js';
import type { NewUsageFact, UsageFactForPricing } from '../types/usage-fact.type.js';

// Insert-only and project-scoped; see ../../INVARIANTS.md for the one cross-project exception.
@Injectable()
export class UsageFactRepositoryService {
  constructor(
    @InjectRepository(UsageFactEntity)
    private readonly _usageFactRepository: Repository<UsageFactEntity>,
  ) {}

  async insert(projectId: string, fact: NewUsageFact): Promise<'created' | 'duplicate'> {
    try {
      await this._usageFactRepository.insert(
        asInsertable(new UsageFactEntity({ ...fact, projectId })),
      );
      return 'created';
    } catch (error) {
      if (isDuplicateKeyError(error)) return 'duplicate';
      throw error;
    }
  }

  // Cross-project by design: background derivation, never reachable from a request (ADR-0009).
  async findWithoutCostFactAcrossProjects(limit: number): Promise<UsageFactForPricing[]> {
    return this._usageFactRepository
      .createQueryBuilder('usageFact')
      .leftJoin('cost_facts', 'costFact', 'costFact.usage_fact_id = usageFact.id')
      .select([
        'usageFact.id',
        'usageFact.projectId',
        'usageFact.status',
        'usageFact.inputTokens',
        'usageFact.outputTokens',
        'usageFact.cachedInputTokens',
        'usageFact.details',
        'usageFact.serviceTier',
        'usageFact.inferenceGeo',
        'usageFact.speed',
        'usageFact.provider',
        'usageFact.respondedModel',
        'usageFact.customerId',
        'usageFact.feature',
        'usageFact.attributionStatus',
        'usageFact.occurredAt',
      ])
      .where('costFact.id IS NULL')
      .orderBy('usageFact.id', 'ASC')
      .limit(limit)
      .getMany() as Promise<UsageFactForPricing[]>;
  }

  // Full rows on purpose, for inspection in tests. Product reads use projections.
  async findAllByProjectId(projectId: string): Promise<UsageFactEntity[]> {
    return this._usageFactRepository.find({ where: { projectId }, order: { id: 'ASC' } });
  }
}
