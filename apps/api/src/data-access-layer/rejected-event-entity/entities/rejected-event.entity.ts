import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Kept with its reason instead of dropped: silently lost usage is the worst failure here
// (ADR-0002). Not deduplicated — these rows are evidence, never counted as usage.
@Entity('rejected_events')
@Index('ix_rejected_events_project_received', ['projectId', 'receivedAt'])
export class RejectedEventEntity {
  constructor(data?: Partial<RejectedEventEntity>) {
    Object.assign(this, data ?? {});
  }

  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'project_id', type: 'bigint', unsigned: true })
  projectId!: string;

  // Null when the event was too malformed to carry a valid one.
  @Column({ name: 'idempotency_key', type: 'char', length: 36, nullable: true })
  idempotencyKey!: string | null;

  @Column({ name: 'received_at', type: 'datetime', precision: 3 })
  receivedAt!: Date;

  @Column({ name: 'stored_at', type: 'datetime', precision: 3, insert: false })
  storedAt!: Date;

  // Null when the event was JSON null or nested too deeply to store.
  @Column({ type: 'json', nullable: true })
  payload!: unknown;

  @Column({ type: 'json' })
  issues!: unknown;

  @Column({ name: 'sdk_name', type: 'varchar', length: 128 })
  sdkName!: string;

  @Column({ name: 'sdk_version', type: 'varchar', length: 64 })
  sdkVersion!: string;
}
