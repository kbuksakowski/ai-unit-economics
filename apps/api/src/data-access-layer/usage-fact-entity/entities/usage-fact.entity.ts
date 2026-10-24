import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Usage normalised by one adapter version; insert-only (ADR-0007, ADR-0009).
@Entity('usage_facts')
@Index('uq_usage_facts_event_version', ['usageEventId', 'normalizationVersion'], { unique: true })
@Index('ix_usage_facts_project_occurred', ['projectId', 'occurredAt'])
export class UsageFactEntity {
  constructor(data?: Partial<UsageFactEntity>) {
    Object.assign(this, data ?? {});
  }

  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'project_id', type: 'bigint', unsigned: true })
  projectId!: string;

  @Column({ name: 'usage_event_id', type: 'bigint', unsigned: true })
  usageEventId!: string;

  @Column({ name: 'normalization_version', type: 'varchar', length: 32 })
  normalizationVersion!: string;

  // NORMALIZED | NOT_REPORTED | UNRECOGNIZED_SHAPE
  @Column({ type: 'varchar', length: 24 })
  status!: string;

  @Column({ name: 'status_reason', type: 'varchar', length: 512, nullable: true })
  statusReason!: string | null;

  // BIGINT columns arrive as strings; counts are never floats.
  @Column({ name: 'input_tokens', type: 'bigint', unsigned: true, nullable: true })
  inputTokens!: string | null;

  @Column({ name: 'output_tokens', type: 'bigint', unsigned: true, nullable: true })
  outputTokens!: string | null;

  @Column({ name: 'cached_input_tokens', type: 'bigint', unsigned: true, nullable: true })
  cachedInputTokens!: string | null;

  // Bucket name to count, counts as decimal strings.
  @Column({ type: 'json', nullable: true })
  details!: unknown;

  @Column({ name: 'service_tier', type: 'varchar', length: 32, nullable: true })
  serviceTier!: string | null;

  @Column({ name: 'inference_geo', type: 'varchar', length: 32, nullable: true })
  inferenceGeo!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  speed!: string | null;

  @Column({ type: 'varchar', length: 32 })
  provider!: string;

  @Column({ name: 'responded_model', type: 'varchar', length: 256, nullable: true })
  respondedModel!: string | null;

  @Column({ name: 'customer_id', type: 'varchar', length: 256, nullable: true })
  customerId!: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  feature!: string | null;

  // ATTRIBUTED | UNATTRIBUTED (ADR-0009)
  @Column({ name: 'attribution_status', type: 'varchar', length: 16 })
  attributionStatus!: string;

  @Column({ name: 'occurred_at', type: 'datetime', precision: 3 })
  occurredAt!: Date;

  @Column({ name: 'created_at', type: 'datetime', precision: 3, insert: false })
  createdAt!: Date;
}
