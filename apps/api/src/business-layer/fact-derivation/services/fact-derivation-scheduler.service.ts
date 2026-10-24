import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';

import { FACT_DERIVATION_INTERVAL_MS } from '../constants/fact-derivation.constants.js';
import { FactDerivationService } from './fact-derivation.service.js';

// A plain interval rather than @nestjs/schedule: one loop does not justify a dependency.
@Injectable()
export class FactDerivationSchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
  private _timer: NodeJS.Timeout | null = null;
  private _running: Promise<void> | null = null;

  constructor(
    private readonly _factDerivationService: FactDerivationService,
    @Inject(FACT_DERIVATION_INTERVAL_MS) private readonly _intervalMs: number,
  ) {}

  onApplicationBootstrap(): void {
    if (this._intervalMs > 0) this._timer = setInterval(() => this.tick(), this._intervalMs);
  }

  // Stops after the current batch and waits for it, so the pool is not closed under it.
  async onModuleDestroy(): Promise<void> {
    if (this._timer) clearInterval(this._timer);
    this._factDerivationService.requestStop();
    await this._running;
  }

  private tick(): void {
    if (this._running) return;
    this._running = this._factDerivationService
      .deriveAll()
      .then(() => undefined)
      .catch((error: unknown) => {
        // The message only: a database error object carries queries and customer values.
        console.error(
          '[FactDerivationScheduler] derivation failed:',
          error instanceof Error ? error.message : 'unknown error',
        );
      })
      .finally(() => {
        this._running = null;
      });
  }
}
