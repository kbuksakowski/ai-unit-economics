import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// What a usage fact cost under one pricing version. Insert-only: a correction is a new
// revision pointing back via `supersedesId`; "current" is the row nothing supersedes (ADR-0009).
@Entity('cost_facts')
@Index('uq_cost_facts_usage_revision', ['usageFactId', 'revision'], { unique: true })
@Index('uq_cost_facts_supersedes', ['supersedesId'], { unique: true })
@Index('ix_cost_facts_project_occurred', ['projectId', 'occurredAt'])
export class CostFactEntity {
  constructor(data?: Partial<CostFactEntity>) {
    Object.assign(this, data ?? {});
  }

  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'project_id', type: 'bigint', unsigned: true })
  projectId!: string;

  @Column({ name: 'usage_fact_id', type: 'bigint', unsigned: true })
  usageFactId!: string;

  @Column({ type: 'int', unsigned: true })
  revision!: number;

  @Column({ name: 'supersedes_id', type: 'bigint', unsigned: true, nullable: true })
  supersedesId!: string | null;

  // INITIAL | PRICING_CORRECTION
  @Column({ type: 'varchar', length: 32 })
  reason!: string;

  @Column({ name: 'pricing_version', type: 'varchar', length: 64 })
  pricingVersion!: string;

  // See CostStatus in packages/core.
  @Column({ type: 'varchar', length: 32 })
  status!: string;

  // Null unless every component was priced (ADR-0009). DECIMAL arrives as a string.
  @Column({ type: 'decimal', precision: 30, scale: 12, nullable: true })
  amount!: string | null;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  // Bucket name to amount, amounts as decimal strings.
  @Column({ name: 'cost_details', type: 'json' })
  costDetails!: unknown;

  @Column({ name: 'missing_components', type: 'json' })
  missingComponents!: unknown;

  @Column({ name: 'rate_valid_from', type: 'datetime', precision: 3, nullable: true })
  rateValidFrom!: Date | null;

  @Column({ name: 'responded_model', type: 'varchar', length: 256, nullable: true })
  respondedModel!: string | null;

  @Column({ name: 'customer_id', type: 'varchar', length: 256, nullable: true })
  customerId!: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  feature!: string | null;

  @Column({ name: 'attribution_status', type: 'varchar', length: 16 })
  attributionStatus!: string;

  @Column({ name: 'occurred_at', type: 'datetime', precision: 3 })
  occurredAt!: Date;

  @Column({ name: 'created_at', type: 'datetime', precision: 3, insert: false })
  createdAt!: Date;
}
