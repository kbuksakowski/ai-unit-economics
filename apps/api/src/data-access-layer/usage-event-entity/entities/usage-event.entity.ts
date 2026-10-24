import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// An accepted event exactly as delivered, insert-only. Normalisation and pricing derive new
// facts from it later, so a fix to either replays over the original input (ADR-0007, ADR-0009).
// The unique index is the idempotency guarantee itself (ADR-0003).
@Entity('usage_events')
@Index('uq_usage_events_project_idempotency', ['projectId', 'idempotencyKey'], { unique: true })
@Index('ix_usage_events_project_occurred', ['projectId', 'occurredAt'])
export class UsageEventEntity {
  constructor(data?: Partial<UsageEventEntity>) {
    Object.assign(this, data ?? {});
  }

  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  // A column, not a relation: every query filters on it. FK lives in the migration.
  @Column({ name: 'project_id', type: 'bigint', unsigned: true })
  projectId!: string;

  @Column({ name: 'idempotency_key', type: 'char', length: 36 })
  idempotencyKey!: string;

  @Column({ name: 'usage_event_id', type: 'char', length: 36 })
  usageEventId!: string;

  // Three clocks (ADR-0002): the caller's, ours on receipt, the database's on write.
  @Column({ name: 'occurred_at', type: 'datetime', precision: 3 })
  occurredAt!: Date;

  @Column({ name: 'received_at', type: 'datetime', precision: 3 })
  receivedAt!: Date;

  @Column({ name: 'stored_at', type: 'datetime', precision: 3, insert: false })
  storedAt!: Date;

  @Column({ type: 'varchar', length: 32 })
  provider!: string;

  @Column({ name: 'provider_client_name', type: 'varchar', length: 128 })
  providerClientName!: string;

  @Column({ name: 'provider_client_version', type: 'varchar', length: 64, nullable: true })
  providerClientVersion!: string | null;

  @Column({ name: 'requested_model', type: 'varchar', length: 256 })
  requestedModel!: string;

  @Column({ name: 'responded_model', type: 'varchar', length: 256, nullable: true })
  respondedModel!: string | null;

  @Column({ type: 'varchar', length: 64 })
  operation!: string;

  @Column({ name: 'provider_request_id', type: 'varchar', length: 256, nullable: true })
  providerRequestId!: string | null;

  @Column({ name: 'customer_id', type: 'varchar', length: 256, nullable: true })
  customerId!: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  feature!: string | null;

  @Column({ type: 'varchar', length: 16 })
  status!: string;

  @Column({ name: 'error_type', type: 'varchar', length: 256, nullable: true })
  errorType!: string | null;

  @Column({ name: 'duration_ms', type: 'int', unsigned: true, nullable: true })
  durationMs!: number | null;

  @Column({ name: 'usage_status', type: 'varchar', length: 16 })
  usageStatus!: string;

  // The provider's usage object, untouched; the server normalises it later (ADR-0007).
  @Column({ name: 'raw_usage', type: 'json', nullable: true })
  rawUsage!: unknown;

  @Column({ name: 'sdk_name', type: 'varchar', length: 128 })
  sdkName!: string;

  @Column({ name: 'sdk_version', type: 'varchar', length: 64 })
  sdkVersion!: string;
}
