/**
 * The usage event: what the SDK reports for a single call to an AI provider.
 *
 * This is a wire contract and nothing else. It carries no cost, no normalised token
 * counts and no domain logic — the server owns all three. See docs/adr/0002 and 0007.
 *
 * There is deliberately no field for prompts or model output. Their absence is
 * structural, not a matter of policy: they cannot be sent because they cannot be
 * expressed.
 */
import { z } from 'zod';

import { MAX_BUSINESS_ID_LENGTH } from './limits.js';

const jsonValueSchema: z.ZodType<import('./json.js').JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

/** Providers this contract version knows about. */
export const providerSchema = z.enum(['anthropic']);

/**
 * Whether the provider's call succeeded — independent of whether usage came back.
 * A failed call can still report usage: providers bill for output generated before a
 * mid-stream failure.
 */
export const callStatusSchema = z.enum(['success', 'error']);

/**
 * Whether a usage object is present.
 *
 * Kept separate from the call status because "there was nothing to measure" and "we
 * could not price what we measured" are different facts. Collapsing them would pollute
 * the unpriced figure, which is one of the completeness metrics the product exists to
 * provide.
 */
export const usageStatusSchema = z.enum(['reported', 'not_reported']);

/** The library that produced `rawUsage`, not our SDK. See the envelope for that. */
export const providerClientSchema = z.object({
  name: z.string().min(1).max(128),
  version: z.string().max(64).optional(),
});

const businessIdSchema = z.string().min(1).max(MAX_BUSINESS_ID_LENGTH);

export const usageEventSchema = z
  .object({
    /** Identifies the delivery. A retry reuses the same value. */
    idempotencyKey: z.uuidv7(),
    /** Identifies the usage itself. Survives a correction of the event. */
    usageEventId: z.uuidv7(),

    /** When the call happened, per the caller's clock. */
    occurredAt: z.iso.datetime({ offset: false }),

    provider: providerSchema,
    providerClient: providerClientSchema,

    /** What was asked for. May be an alias. */
    requestedModel: z.string().min(1).max(256),
    /** What answered. Pricing uses this, never the requested model. */
    respondedModel: z.string().min(1).max(256).optional(),

    /** Operation name, following the OpenTelemetry GenAI conventions. */
    operation: z.string().min(1).max(64),

    /** The provider's own request id, the only join key back to their billing. */
    providerRequestId: z.string().max(256).optional(),

    /**
     * Optional on purpose. Usage without a customer is still real cost, and if this
     * were required the "unattributed" metric would be structurally zero.
     */
    customerId: businessIdSchema.optional(),
    feature: businessIdSchema.optional(),

    status: callStatusSchema,
    errorType: z.string().max(256).optional(),
    durationMs: z.number().int().nonnegative().max(86_400_000).optional(),

    usageStatus: usageStatusSchema,
    /** The provider's usage object, untouched. The server normalises it. */
    rawUsage: jsonValueSchema.optional(),
  })
  .refine((event) => event.usageStatus === 'not_reported' || event.rawUsage !== undefined, {
    message: 'usageStatus "reported" requires rawUsage to be present',
    path: ['rawUsage'],
  });

export type UsageEvent = z.infer<typeof usageEventSchema>;
export type Provider = z.infer<typeof providerSchema>;
export type CallStatus = z.infer<typeof callStatusSchema>;
export type UsageStatus = z.infer<typeof usageStatusSchema>;
export type ProviderClient = z.infer<typeof providerClientSchema>;
