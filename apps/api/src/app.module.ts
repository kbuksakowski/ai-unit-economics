import { Module, type DynamicModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AnalyticsModule } from './business-layer/analytics/analytics.module.js';
import { FactDerivationModule } from './business-layer/fact-derivation/fact-derivation.module.js';
import { IngestionModule } from './business-layer/ingestion/ingestion.module.js';
import type { AppOptions } from './config/env.config.js';
import { typeOrmOptions } from './config/typeorm.config.js';

// Dynamic so tests can point the same module graph at the test database.
@Module({})
export class AppModule {
  static forRoot(options: AppOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        TypeOrmModule.forRoot(typeOrmOptions(options.database)),
        IngestionModule,
        FactDerivationModule.forRoot(options.factDerivationIntervalMs),
        AnalyticsModule,
      ],
    };
  }
}
