/**
 * Duplicated from `@ai-unit-economics/contracts` on purpose: importing the value would
 * load `contracts` and `zod` at runtime. A test asserts the two stay equal; see
 * docs/adr/0008.
 */
export const MAX_BUSINESS_ID_LENGTH = 256;
