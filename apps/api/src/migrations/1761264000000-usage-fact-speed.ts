import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Anthropic added `speed` to the usage object; fast mode bills at separate rates, so pricing
 * needs it (ADR-0009). Same defensive convention as the read-key migration: short lock
 * waits, in-place, idempotent. Nullable: facts written before carry no speed.
 */
export class UsageFactSpeed1761264000000 implements MigrationInterface {
  name = 'UsageFactSpeed1761264000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SET SESSION lock_wait_timeout = 5');
    await queryRunner.query('SET SESSION innodb_lock_wait_timeout = 5');
    if (!(await queryRunner.hasColumn('usage_facts', 'speed'))) {
      await queryRunner.query(`
        ALTER TABLE usage_facts
          ADD COLUMN speed VARCHAR(16) NULL AFTER inference_geo,
          ALGORITHM=INPLACE, LOCK=NONE
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('usage_facts', 'speed')) {
      await queryRunner.query('ALTER TABLE usage_facts DROP COLUMN speed');
    }
  }
}
