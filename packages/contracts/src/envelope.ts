/**
 * The request envelope and the ingestion response.
 *
 * A batch envelope is used from the first release even when it carries one event, so
 * that SDK-side buffering can arrive later without changing the wire format. It is a
 * named object rather than a bare array, leaving room for request-level fields.
 *
 * Envelope-level problems are HTTP status codes; per-event outcomes are the response
 * body. A well-formed envelope always answers 200, even when every event inside it
 * failed. See docs/adr/0002.
 */
import { z } from 'zod';

import { MAX_EVENTS_PER_BATCH } from './limits.js';
import { usageEventSchema } from './usage-event.js';

/** Identifies our SDK, as opposed to the provider client that produced the usage. */
export const sdkIdentitySchema = z.object({
  name: z.string().min(1).max(128),
  version: z.string().min(1).max(64),
});

/**
 * Unknown top-level fields are stripped rather than rejected. Under self-hosting a
 * customer's SDK will routinely be newer than their server, and strict rejection would
 * block them from upgrading either one independently.
 */
export const ingestEnvelopeSchema = z.object({
  sdk: sdkIdentitySchema,
  events: z.array(usageEventSchema).min(1).max(MAX_EVENTS_PER_BATCH),
});

/** `200` means the event was a duplicate: accepted, not counted a second time. */
export const ingestSuccessSchema = z.object({
  idempotencyKey: z.uuidv7(),
  status: z.union([z.literal(201), z.literal(200)]),
});

/**
 * `idempotencyKey` is optional because an event can be malformed enough that it cannot
 * be read.
 */
export const ingestErrorSchema = z.object({
  idempotencyKey: z.uuidv7().optional(),
  code: z.string().min(1).max(64),
  message: z.string().min(1).max(1024),
});

export const ingestResponseSchema = z.object({
  successes: z.array(ingestSuccessSchema),
  errors: z.array(ingestErrorSchema),
});

export type SdkIdentity = z.infer<typeof sdkIdentitySchema>;
export type IngestEnvelope = z.infer<typeof ingestEnvelopeSchema>;
export type IngestSuccess = z.infer<typeof ingestSuccessSchema>;
export type IngestError = z.infer<typeof ingestErrorSchema>;
export type IngestResponse = z.infer<typeof ingestResponseSchema>;
