import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A second, read-only key per project (ADR-0005). The first ALTER on a live table, so it follows
 * a defensive convention: short lock waits, in-place, and idempotent.
 * Nullable: rows created before this column carry none.
 */
export class ProjectReadKey1759622400000 implements MigrationInterface {
  name = 'ProjectReadKey1759622400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SET SESSION lock_wait_timeout = 5');
    await queryRunner.query('SET SESSION innodb_lock_wait_timeout = 5');
    if (!(await queryRunner.hasColumn('projects', 'read_key_hash'))) {
      await queryRunner.query(`
        ALTER TABLE projects
          ADD COLUMN read_key_hash CHAR(64) CHARACTER SET ascii NULL AFTER api_key_hash,
          ADD UNIQUE KEY uq_projects_read_key_hash (read_key_hash),
          ALGORITHM=INPLACE, LOCK=NONE
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('projects', 'read_key_hash')) {
      await queryRunner.query(
        'ALTER TABLE projects DROP INDEX uq_projects_read_key_hash, DROP COLUMN read_key_hash',
      );
    }
  }
}
