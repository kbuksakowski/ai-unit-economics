import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Two keys per project — ingestion and read — no accounts, no rotation (ADR-0005).
@Entity('projects')
@Index('uq_projects_api_key_hash', ['apiKeyHash'], { unique: true })
@Index('uq_projects_read_key_hash', ['readKeyHash'], { unique: true })
export class ProjectEntity {
  constructor(data?: Partial<ProjectEntity>) {
    Object.assign(this, data ?? {});
  }

  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  // SHA-256 hex; the key itself is never stored.
  @Column({ name: 'api_key_hash', type: 'char', length: 64 })
  apiKeyHash!: string;

  // Opens analytics only. Null for rows created before this column existed.
  @Column({ name: 'read_key_hash', type: 'char', length: 64, nullable: true })
  readKeyHash!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt!: Date;
}
