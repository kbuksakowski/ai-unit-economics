/**
 * The completeness overview at the top of the dashboard (ADR-0010): what the cost figure covers,
 * and three separate numbers for what it does not. No single trust score (ADR-0010).
 */
import { z } from 'zod';

const isoDateTime = z.iso.datetime({ offset: false });
const decimalSchema = z.string().regex(/^-?(0|[1-9]\d*)(\.\d*[1-9])?$/);
const countSchema = z.number().int().nonnegative();
/** Token counts can exceed 2^53 over a long range, so they travel as decimal strings. */
const tokenCountSchema = z.string().regex(/^(0|[1-9]\d*)$/);

/** `from` inclusive, `to` exclusive, both required (ADR-0010). */
export const costOverviewQuerySchema = z
  .object({ from: isoDateTime, to: isoDateTime })
  .refine((query) => Date.parse(query.from) < Date.parse(query.to), {
    message: '"from" must be earlier than "to"',
    path: ['to'],
  });

export const pricedTotalSchema = z.object({
  currency: z.string().length(3),
  amount: decimalSchema,
  events: countSchema,
});

/** Why an event has no price. Tokens are null when the usage itself could not be read. */
export const notPricedReasonSchema = z.object({
  events: countSchema,
  tokens: tokenCountSchema.nullable(),
});

export const costOverviewResponseSchema = z.object({
  from: isoDateTime,
  to: isoDateTime,
  /** One entry per currency; never summed across currencies. Empty when nothing was priced. */
  priced: z.array(pricedTotalSchema),
  /** Usage without a customer: stored, counted, never dropped (ADR-0009). */
  unattributed: z.object({
    events: countSchema,
    priced: z.array(pricedTotalSchema),
  }),
  /** Usage we measured but could not price. Its size is in tokens, never a guessed amount. */
  notPriced: z.object({
    events: countSchema,
    /** Tokens of the events whose usage was readable; see `byReason.USAGE_UNRECOGNIZED`. */
    knownTokens: tokenCountSchema,
    byReason: z.object({
      UNKNOWN_MODEL: notPricedReasonSchema,
      MISSING_PRICE_COMPONENT: notPricedReasonSchema,
      NO_RATE_FOR_PERIOD: notPricedReasonSchema,
      USAGE_UNRECOGNIZED: notPricedReasonSchema,
    }),
  }),
  /** Calls with no usage reported at all, such as streams in this release. */
  notMeasured: z.object({ events: countSchema }),
});

export type CostOverviewQuery = z.infer<typeof costOverviewQuerySchema>;
export type PricedTotal = z.infer<typeof pricedTotalSchema>;
export type NotPricedReason = z.infer<typeof notPricedReasonSchema>;
export type CostOverviewResponse = z.infer<typeof costOverviewResponseSchema>;
export type NotPricedStatus = keyof CostOverviewResponse['notPriced']['byReason'];
