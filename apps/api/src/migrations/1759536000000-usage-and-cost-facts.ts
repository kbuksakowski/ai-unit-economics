import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Derived facts, insert-only like the events they come from (ADR-0009). Tokens are
 * BIGINT and money DECIMAL: neither is ever a float.
 */
export class UsageAndCostFacts1759536000000 implements MigrationInterface {
  name = 'UsageAndCostFacts1759536000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // One fact per event and adapter version, so a fixed adapter can replay alongside.
    await queryRunner.query(`
      CREATE TABLE usage_facts (
        id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        project_id             BIGINT UNSIGNED NOT NULL,
        usage_event_id         BIGINT UNSIGNED NOT NULL,
        normalization_version  VARCHAR(32) CHARACTER SET ascii NOT NULL,
        status                 VARCHAR(24) CHARACTER SET ascii NOT NULL,
        status_reason          VARCHAR(512) NULL,
        input_tokens           BIGINT UNSIGNED NULL,
        output_tokens          BIGINT UNSIGNED NULL,
        cached_input_tokens    BIGINT UNSIGNED NULL,
        details                JSON NULL,
        service_tier           VARCHAR(32) NULL,
        inference_geo          VARCHAR(32) NULL,
        provider               VARCHAR(32) NOT NULL,
        responded_model        VARCHAR(256) NULL,
        customer_id            VARCHAR(256) NULL,
        feature                VARCHAR(256) NULL,
        attribution_status     VARCHAR(16) CHARACTER SET ascii NOT NULL,
        occurred_at            DATETIME(3) NOT NULL,
        created_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_usage_facts_event_version (usage_event_id, normalization_version),
        KEY ix_usage_facts_project_occurred (project_id, occurred_at),
        CONSTRAINT fk_usage_facts_project FOREIGN KEY (project_id) REFERENCES projects (id),
        CONSTRAINT fk_usage_facts_event FOREIGN KEY (usage_event_id) REFERENCES usage_events (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
    `);

    // Revision 1 is unique per usage fact, so two replicas cannot both price the same fact.
    // A correction is a new row pointing at what it replaces; no row is ever updated.
    await queryRunner.query(`
      CREATE TABLE cost_facts (
        id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        project_id           BIGINT UNSIGNED NOT NULL,
        usage_fact_id        BIGINT UNSIGNED NOT NULL,
        revision             INT UNSIGNED NOT NULL,
        supersedes_id        BIGINT UNSIGNED NULL,
        reason               VARCHAR(32) CHARACTER SET ascii NOT NULL,
        pricing_version      VARCHAR(64) CHARACTER SET ascii NOT NULL,
        status               VARCHAR(32) CHARACTER SET ascii NOT NULL,
        amount               DECIMAL(30, 12) NULL,
        currency             CHAR(3) CHARACTER SET ascii NOT NULL,
        cost_details         JSON NOT NULL,
        missing_components   JSON NOT NULL,
        rate_valid_from      DATETIME(3) NULL,
        responded_model      VARCHAR(256) NULL,
        customer_id          VARCHAR(256) NULL,
        feature              VARCHAR(256) NULL,
        attribution_status   VARCHAR(16) CHARACTER SET ascii NOT NULL,
        occurred_at          DATETIME(3) NOT NULL,
        created_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_cost_facts_usage_revision (usage_fact_id, revision),
        UNIQUE KEY uq_cost_facts_supersedes (supersedes_id),
        KEY ix_cost_facts_project_occurred (project_id, occurred_at),
        CONSTRAINT fk_cost_facts_project FOREIGN KEY (project_id) REFERENCES projects (id),
        CONSTRAINT fk_cost_facts_usage_fact FOREIGN KEY (usage_fact_id) REFERENCES usage_facts (id),
        CONSTRAINT fk_cost_facts_supersedes FOREIGN KEY (supersedes_id) REFERENCES cost_facts (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE cost_facts');
    await queryRunner.query('DROP TABLE usage_facts');
  }
}
