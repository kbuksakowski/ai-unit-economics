/**
 * Attributes AI usage to customers and features.
 *
 * Every type in this public surface is defined here, never re-exported from
 * `@ai-unit-economics/contracts`, so the published declarations carry no reference to it
 * or to `zod`. See docs/adr/0008.
 */
export { createClient, type Client, type ClientConfig, type TrackOptions } from './client.js';
export type { OnError, SdkDiagnostic, SdkDiagnosticCode } from './diagnostics.js';
