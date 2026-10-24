import type { UsageEventEntity } from '../entities/usage-event.entity.js';

/** A row as ingestion builds it; the database supplies the id and `storedAt`. */
export type NewUsageEvent = Omit<UsageEventEntity, 'id' | 'projectId' | 'storedAt'>;

export type UsageEventInsertOutcome = 'created' | 'duplicate';

export type UsageEventForDerivation = Pick<
  UsageEventEntity,
  | 'id'
  | 'projectId'
  | 'provider'
  | 'usageStatus'
  | 'rawUsage'
  | 'respondedModel'
  | 'customerId'
  | 'feature'
  | 'occurredAt'
>;
