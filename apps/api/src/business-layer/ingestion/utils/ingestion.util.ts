import {
  MAX_EVENTS_PER_BATCH,
  sdkIdentitySchema,
  type SdkIdentity,
  type UsageEvent,
} from '@ai-unit-economics/contracts';
import { z } from 'zod';

import type { NewUsageEvent } from '../../../data-access-layer/usage-event-entity/types/usage-event.type.js';

// The envelope is validated without its events, so one bad event cannot fail the batch (ADR-0002).
export const ingestionEnvelopeShellSchema = z.object({
  sdk: sdkIdentitySchema,
  events: z.array(z.unknown()).min(1).max(MAX_EVENTS_PER_BATCH),
});

export function mapUsageEventToNewUsageEvent(
  event: UsageEvent,
  receivedAt: Date,
  sdk: SdkIdentity,
): NewUsageEvent {
  return {
    idempotencyKey: event.idempotencyKey,
    usageEventId: event.usageEventId,
    occurredAt: new Date(event.occurredAt),
    receivedAt,
    provider: event.provider,
    providerClientName: event.providerClient.name,
    providerClientVersion: event.providerClient.version ?? null,
    requestedModel: event.requestedModel,
    respondedModel: event.respondedModel ?? null,
    operation: event.operation,
    providerRequestId: event.providerRequestId ?? null,
    customerId: event.customerId ?? null,
    feature: event.feature ?? null,
    status: event.status,
    errorType: event.errorType ?? null,
    durationMs: event.durationMs ?? null,
    usageStatus: event.usageStatus,
    rawUsage: event.rawUsage ?? null,
    sdkName: sdk.name,
    sdkVersion: sdk.version,
  };
}

/** Nesting depth of a JSON value, computed iteratively and abandoned past `limit`. */
export function jsonDepthExceeds(value: unknown, limit: number): boolean {
  const stack: Array<{ node: unknown; depth: number }> = [{ node: value, depth: 1 }];
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (typeof node !== 'object' || node === null) continue;
    if (depth > limit) return true;
    for (const child of Object.values(node)) stack.push({ node: child, depth: depth + 1 });
  }
  return false;
}

// An invalid event may still carry a readable key, which lets the SDK match the error to it.
export function readIngestionIdempotencyKey(raw: unknown): string | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const parsed = z.uuidv7().safeParse((raw as { idempotencyKey?: unknown }).idempotencyKey);
  return parsed.success ? parsed.data : undefined;
}
