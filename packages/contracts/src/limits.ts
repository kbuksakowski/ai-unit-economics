/**
 * Limits shared by the SDK and the ingestion API.
 *
 * They live here so the two cannot drift: a batch the SDK considers valid must be a batch
 * the server accepts.
 */

/** Maximum events in a single request. */
export const MAX_EVENTS_PER_BATCH = 100;

/** Maximum request body size in bytes. */
export const MAX_BODY_BYTES = 1_048_576;

/** Maximum length of the business identifiers the caller supplies. */
export const MAX_BUSINESS_ID_LENGTH = 256;

/** Maximum groups in one cost summary; more sets `truncated` rather than paging, in this release. */
export const MAX_COST_SUMMARY_GROUPS = 500;
