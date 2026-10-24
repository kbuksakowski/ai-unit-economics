import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Written by hand rather than generated, so the schema is read and reviewed as SQL.
 * Identifiers are ASCII; business identifiers are utf8mb4 because customers choose them.
 */
export class InitialSchema1759449600000 implements MigrationInterface {
  name = 'InitialSchema1759449600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE projects (
        id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        name          VARCHAR(128) NOT NULL,
        api_key_hash  CHAR(64) CHARACTER SET ascii NOT NULL,
        created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_projects_api_key_hash (api_key_hash)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
    `);

    // The unique key is the idempotency guarantee itself (docs/adr/0003): permanent, no
    // time window, enforced by the database so it holds across concurrent replicas.
    await queryRunner.query(`
      CREATE TABLE usage_events (
        id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        project_id               BIGINT UNSIGNED NOT NULL,
        idempotency_key          CHAR(36) CHARACTER SET ascii NOT NULL,
        usage_event_id           CHAR(36) CHARACTER SET ascii NOT NULL,
        occurred_at              DATETIME(3) NOT NULL,
        received_at              DATETIME(3) NOT NULL,
        stored_at                DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        provider                 VARCHAR(32) NOT NULL,
        provider_client_name     VARCHAR(128) NOT NULL,
        provider_client_version  VARCHAR(64) NULL,
        requested_model          VARCHAR(256) NOT NULL,
        responded_model          VARCHAR(256) NULL,
        operation                VARCHAR(64) NOT NULL,
        provider_request_id      VARCHAR(256) NULL,
        customer_id              VARCHAR(256) NULL,
        feature                  VARCHAR(256) NULL,
        status                   VARCHAR(16) NOT NULL,
        error_type               VARCHAR(256) NULL,
        duration_ms              INT UNSIGNED NULL,
        usage_status             VARCHAR(16) NOT NULL,
        raw_usage                JSON NULL,
        sdk_name                 VARCHAR(128) NOT NULL,
        sdk_version              VARCHAR(64) NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_usage_events_project_idempotency (project_id, idempotency_key),
        KEY ix_usage_events_project_occurred (project_id, occurred_at),
        CONSTRAINT fk_usage_events_project FOREIGN KEY (project_id) REFERENCES projects (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
    `);

    await queryRunner.query(`
      CREATE TABLE rejected_events (
        id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        project_id       BIGINT UNSIGNED NOT NULL,
        idempotency_key  CHAR(36) CHARACTER SET ascii NULL,
        received_at      DATETIME(3) NOT NULL,
        stored_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        payload          JSON NOT NULL,
        issues           JSON NOT NULL,
        sdk_name         VARCHAR(128) NOT NULL,
        sdk_version      VARCHAR(64) NOT NULL,
        PRIMARY KEY (id),
        KEY ix_rejected_events_project_received (project_id, received_at),
        CONSTRAINT fk_rejected_events_project FOREIGN KEY (project_id) REFERENCES projects (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE rejected_events');
    await queryRunner.query('DROP TABLE usage_events');
    await queryRunner.query('DROP TABLE projects');
  }
}
