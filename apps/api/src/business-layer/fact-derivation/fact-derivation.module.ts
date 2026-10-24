import { Module, type DynamicModule } from '@nestjs/common';

import { CostFactEntityModule } from '../../data-access-layer/cost-fact-entity/cost-fact.entity.module.js';
import { UsageEventEntityModule } from '../../data-access-layer/usage-event-entity/usage-event.entity.module.js';
import { UsageFactEntityModule } from '../../data-access-layer/usage-fact-entity/usage-fact.entity.module.js';
import { FACT_DERIVATION_INTERVAL_MS } from './constants/fact-derivation.constants.js';
import { FactDerivationSchedulerService } from './services/fact-derivation-scheduler.service.js';
import { FactDerivationService } from './services/fact-derivation.service.js';

@Module({})
export class FactDerivationModule {
  static forRoot(intervalMs: number): DynamicModule {
    return {
      module: FactDerivationModule,
      imports: [UsageEventEntityModule, UsageFactEntityModule, CostFactEntityModule],
      providers: [
        FactDerivationService,
        FactDerivationSchedulerService,
        { provide: FACT_DERIVATION_INTERVAL_MS, useValue: intervalMs },
      ],
      exports: [FactDerivationService],
    };
  }
}
