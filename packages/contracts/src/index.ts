/**
 * The wire contract shared by the SDK, the API and the dashboard.
 *
 * Deliberately contains no domain logic: no pricing, no token normalisation, no
 * provider-specific parsing. The SDK uses these types internally and never depends on the
 * domain; see docs/adr/0008.
 */
export type { JsonPrimitive, JsonValue } from './json.js';

export {
  MAX_EVENTS_PER_BATCH,
  MAX_BODY_BYTES,
  MAX_BUSINESS_ID_LENGTH,
  MAX_COST_SUMMARY_GROUPS,
} from './limits.js';

export {
  usageEventSchema,
  providerSchema,
  callStatusSchema,
  usageStatusSchema,
  providerClientSchema,
  type UsageEvent,
  type Provider,
  type CallStatus,
  type UsageStatus,
  type ProviderClient,
} from './usage-event.js';

export {
  ingestEnvelopeSchema,
  sdkIdentitySchema,
  ingestResponseSchema,
  ingestSuccessSchema,
  ingestErrorSchema,
  type IngestEnvelope,
  type SdkIdentity,
  type IngestResponse,
  type IngestSuccess,
  type IngestError,
} from './envelope.js';

export {
  costSummaryGroupBySchema,
  costSummaryQuerySchema,
  costSummaryGroupSchema,
  costSummaryResponseSchema,
  type CostSummaryGroupBy,
  type CostSummaryQuery,
  type CostSummaryGroup,
  type CostSummaryResponse,
} from './cost-summary.js';

export {
  costOverviewQuerySchema,
  costOverviewResponseSchema,
  notPricedReasonSchema,
  pricedTotalSchema,
  type CostOverviewQuery,
  type CostOverviewResponse,
  type NotPricedReason,
  type NotPricedStatus,
  type PricedTotal,
} from './cost-overview.js';
