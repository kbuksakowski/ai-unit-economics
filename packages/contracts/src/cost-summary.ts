/**
 * The cost summary read by the dashboard (ADR-0010). Shared so the API and the dashboard cannot
 * drift, like the ingestion contract.
 */
import { z } from 'zod';

export const costSummaryGroupBySchema = z.enum(['customer', 'feature']);

/**
 * `from` inclusive, `to` exclusive, both required: a hidden default range produces a figure
 * that disagrees with an invoice for no visible reason.
 */
export const costSummaryQuerySchema = z
  .object({
    groupBy: costSummaryGroupBySchema,
    from: z.iso.datetime({ offset: false }),
    to: z.iso.datetime({ offset: false }),
  })
  .refine((query) => Date.parse(query.from) < Date.parse(query.to), {
    message: '"from" must be earlier than "to"',
    path: ['to'],
  });

const decimalSchema = z.string().regex(/^-?(0|[1-9]\d*)(\.\d*[1-9])?$/);

export const costSummaryGroupSchema = z.object({
  /** The customer id or feature; null for usage that carried none. */
  key: z.string().nullable(),
  currency: z.string().length(3),
  /** Sum of priced events only. Null when none was priced — never zero for "unknown". */
  amount: decimalSchema.nullable(),
  pricedEvents: z.number().int().nonnegative(),
  /** Left out of `amount`: not priced or not measured. The overview separates the two (ADR-0010). */
  leftOutEvents: z.number().int().nonnegative(),
});

export const costSummaryResponseSchema = z.object({
  groupBy: costSummaryGroupBySchema,
  from: z.iso.datetime({ offset: false }),
  to: z.iso.datetime({ offset: false }),
  groups: z.array(costSummaryGroupSchema),
  truncated: z.boolean(),
});

export type CostSummaryGroupBy = z.infer<typeof costSummaryGroupBySchema>;
export type CostSummaryQuery = z.infer<typeof costSummaryQuerySchema>;
export type CostSummaryGroup = z.infer<typeof costSummaryGroupSchema>;
export type CostSummaryResponse = z.infer<typeof costSummaryResponseSchema>;
