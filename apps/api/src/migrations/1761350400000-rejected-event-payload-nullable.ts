import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A rejected event may be JSON `null`, or too deeply nested to store; its payload is then
 * NULL instead of failing the whole batch (ADR-0002). Same defensive convention as the
 * other ALTER migrations.
 */
export class RejectedEventPayloadNullable1761350400000 implements MigrationInterface {
  name = 'RejectedEventPayloadNullable1761350400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SET SESSION lock_wait_timeout = 5');
    await queryRunner.query('SET SESSION innodb_lock_wait_timeout = 5');
    await queryRunner.query(
      'ALTER TABLE rejected_events MODIFY payload JSON NULL, ALGORITHM=INPLACE, LOCK=NONE',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE rejected_events SET payload = 'null' WHERE payload IS NULL`);
    await queryRunner.query('ALTER TABLE rejected_events MODIFY payload JSON NOT NULL');
  }
}
