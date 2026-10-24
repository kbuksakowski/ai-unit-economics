import type { UsageFactEntity } from '../entities/usage-fact.entity.js';

export type NewUsageFact = Omit<UsageFactEntity, 'id' | 'projectId' | 'createdAt'>;

export type UsageFactForPricing = Pick<
  UsageFactEntity,
  | 'id'
  | 'projectId'
  | 'status'
  | 'inputTokens'
  | 'outputTokens'
  | 'cachedInputTokens'
  | 'details'
  | 'serviceTier'
  | 'inferenceGeo'
  | 'speed'
  | 'provider'
  | 'respondedModel'
  | 'customerId'
  | 'feature'
  | 'attributionStatus'
  | 'occurredAt'
>;
