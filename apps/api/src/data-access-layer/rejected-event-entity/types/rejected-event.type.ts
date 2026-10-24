import type { RejectedEventEntity } from '../entities/rejected-event.entity.js';

/** A row as ingestion builds it; the database supplies the id and `storedAt`. */
export type NewRejectedEvent = Omit<RejectedEventEntity, 'id' | 'projectId' | 'storedAt'>;
