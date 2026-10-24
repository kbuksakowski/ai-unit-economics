import {
  normalizationVersionFor,
  normalizeUsage,
  priceUsage,
  type CostResult,
  type CostStatus,
  type NormalizedUsage,
} from '@ai-unit-economics/core';
import { ANTHROPIC_PRICING_VERSION, ANTHROPIC_RATES } from '@ai-unit-economics/pricing-data';

import type { NewCostFact } from '../../../data-access-layer/cost-fact-entity/types/cost-fact.type.js';
import type { UsageEventForDerivation } from '../../../data-access-layer/usage-event-entity/types/usage-event.type.js';
import type {
  NewUsageFact,
  UsageFactForPricing,
} from '../../../data-access-layer/usage-fact-entity/types/usage-fact.type.js';

const PRICING_CURRENCY = 'USD';

export function mapUsageEventToNewUsageFact(event: UsageEventForDerivation): NewUsageFact {
  const base = {
    usageEventId: event.id,
    provider: event.provider,
    respondedModel: event.respondedModel,
    customerId: event.customerId,
    feature: event.feature,
    attributionStatus: event.customerId ? 'ATTRIBUTED' : 'UNATTRIBUTED',
    occurredAt: event.occurredAt,
    inputTokens: null,
    outputTokens: null,
    cachedInputTokens: null,
    details: null,
    serviceTier: null,
    inferenceGeo: null,
    speed: null,
    statusReason: null,
  };

  // Nothing was measured (a stream, in this release); recorded as such, never as zero tokens.
  if (event.usageStatus !== 'reported') {
    return {
      ...base,
      normalizationVersion: normalizationVersionFor(event.provider),
      status: 'NOT_REPORTED',
    };
  }

  const { normalizationVersion, result } = normalizeUsage(event.provider, event.rawUsage);
  if (result.status === 'UNRECOGNIZED_SHAPE') {
    return {
      ...base,
      normalizationVersion,
      status: result.status,
      statusReason: result.reason.slice(0, 512),
    };
  }
  const usage = result.usage;
  return {
    ...base,
    normalizationVersion,
    status: result.status,
    inputTokens: usage.inputTokens.toString(),
    outputTokens: usage.outputTokens.toString(),
    cachedInputTokens: usage.cachedInputTokens.toString(),
    details: Object.fromEntries(Object.entries(usage.details).map(([k, v]) => [k, v.toString()])),
    serviceTier: usage.serviceTier,
    inferenceGeo: usage.inferenceGeo,
    speed: usage.speed,
  };
}

export function mapUsageFactToNewCostFact(fact: UsageFactForPricing): NewCostFact {
  const base = {
    usageFactId: fact.id,
    pricingVersion: ANTHROPIC_PRICING_VERSION,
    currency: PRICING_CURRENCY,
    respondedModel: fact.respondedModel,
    customerId: fact.customerId,
    feature: fact.feature,
    attributionStatus: fact.attributionStatus,
    occurredAt: fact.occurredAt,
  };

  const unmeasured: CostStatus | null =
    fact.status === 'NOT_REPORTED'
      ? 'NOT_MEASURED'
      : fact.status === 'NORMALIZED'
        ? null
        : 'USAGE_UNRECOGNIZED';
  if (unmeasured) {
    return {
      ...base,
      status: unmeasured,
      amount: null,
      costDetails: {},
      missingComponents: [],
      rateValidFrom: null,
    };
  }

  const cost = priceUsage({
    usage: readNormalizedUsage(fact),
    respondedModel: fact.respondedModel,
    occurredAt: fact.occurredAt,
    rates: ANTHROPIC_RATES,
  });
  return { ...base, ...mapCostResultToColumns(cost) };
}

function mapCostResultToColumns(
  cost: CostResult,
): Pick<NewCostFact, 'status' | 'amount' | 'costDetails' | 'missingComponents' | 'rateValidFrom'> {
  return {
    status: cost.status,
    amount: cost.amount?.amount ?? null,
    costDetails: Object.fromEntries(Object.entries(cost.details).map(([k, v]) => [k, v.amount])),
    missingComponents: cost.missingComponents,
    rateValidFrom: cost.rateValidFrom ? new Date(cost.rateValidFrom) : null,
  };
}

function readNormalizedUsage(fact: UsageFactForPricing): NormalizedUsage {
  const details = (fact.details ?? {}) as Record<string, string>;
  return {
    inputTokens: BigInt(fact.inputTokens ?? 0),
    outputTokens: BigInt(fact.outputTokens ?? 0),
    cachedInputTokens: BigInt(fact.cachedInputTokens ?? 0),
    details: Object.fromEntries(Object.entries(details).map(([k, v]) => [k, BigInt(v)])),
    serviceTier: fact.serviceTier,
    inferenceGeo: fact.inferenceGeo,
    speed: fact.speed,
  };
}
