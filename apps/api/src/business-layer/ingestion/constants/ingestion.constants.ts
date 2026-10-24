export const INGESTION_INVALID_EVENT_CODE = 'invalid_event';
export const INGESTION_STORAGE_FAILED_CODE = 'storage_failed';

// MariaDB's JSON check rejects nesting beyond 32 levels, and validating very deep input
// recursively can exhaust the stack. An event nested deeper is rejected before either.
export const INGESTION_MAX_EVENT_DEPTH = 24;

// Matches `message` in ingestErrorSchema, so a response always satisfies the contract.
export const INGESTION_MAX_ERROR_MESSAGE_LENGTH = 1024;
