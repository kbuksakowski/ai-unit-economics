import { Injectable } from '@nestjs/common';

import { CostFactRepositoryService } from '../../../data-access-layer/cost-fact-entity/providers/cost-fact.repository.service.js';
import { UsageEventRepositoryService } from '../../../data-access-layer/usage-event-entity/providers/usage-event.repository.service.js';
import { UsageFactRepositoryService } from '../../../data-access-layer/usage-fact-entity/providers/usage-fact.repository.service.js';
import { FACT_DERIVATION_BATCH_SIZE } from '../constants/fact-derivation.constants.js';
import {
  mapUsageEventToNewUsageFact,
  mapUsageFactToNewCostFact,
} from '../utils/fact-derivation.util.js';

export interface FactDerivationResult {
  usageFacts: number;
  costFacts: number;
}

/**
 * Derives the facts that are missing: events without a usage fact, then usage facts without
 * a cost fact. Idempotent and safe across replicas — the unique indexes decide, a duplicate is
 * skipped (ADR-0009). Never part of ingestion, so a bug here cannot lose an event.
 */
@Injectable()
export class FactDerivationService {
  constructor(
    private readonly _usageEventRepositoryService: UsageEventRepositoryService,
    private readonly _usageFactRepositoryService: UsageFactRepositoryService,
    private readonly _costFactRepositoryService: CostFactRepositoryService,
  ) {}

  private _stopRequested = false;

  /** Ends a running `deriveAll` after its current batch, so shutdown does not wait for a backlog. */
  requestStop(): void {
    this._stopRequested = true;
  }

  async deriveAll(): Promise<FactDerivationResult> {
    const result = { usageFacts: 0, costFacts: 0 };
    for (let batch = await this.nextEvents(); batch.length; batch = await this.nextEvents()) {
      for (const event of batch) {
        const outcome = await this._usageFactRepositoryService.insert(
          event.projectId,
          mapUsageEventToNewUsageFact(event),
        );
        if (outcome === 'created') result.usageFacts++;
      }
      if (batch.length < FACT_DERIVATION_BATCH_SIZE || this._stopRequested) break;
    }
    for (
      let batch = await this.nextUsageFacts();
      batch.length;
      batch = await this.nextUsageFacts()
    ) {
      for (const fact of batch) {
        const outcome = await this._costFactRepositoryService.insertInitial(
          fact.projectId,
          mapUsageFactToNewCostFact(fact),
        );
        if (outcome === 'created') result.costFacts++;
      }
      if (batch.length < FACT_DERIVATION_BATCH_SIZE || this._stopRequested) break;
    }
    return result;
  }

  private nextEvents() {
    return this._usageEventRepositoryService.findWithoutUsageFactAcrossProjects(
      FACT_DERIVATION_BATCH_SIZE,
    );
  }

  private nextUsageFacts() {
    return this._usageFactRepositoryService.findWithoutCostFactAcrossProjects(
      FACT_DERIVATION_BATCH_SIZE,
    );
  }
}
