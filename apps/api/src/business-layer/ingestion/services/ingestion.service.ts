import {
  usageEventSchema,
  type IngestError,
  type IngestResponse,
  type SdkIdentity,
} from '@ai-unit-economics/contracts';
import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';

import { RejectedEventRepositoryService } from '../../../data-access-layer/rejected-event-entity/providers/rejected-event.repository.service.js';
import { UsageEventRepositoryService } from '../../../data-access-layer/usage-event-entity/providers/usage-event.repository.service.js';
import {
  INGESTION_INVALID_EVENT_CODE,
  INGESTION_MAX_ERROR_MESSAGE_LENGTH,
  INGESTION_MAX_EVENT_DEPTH,
  INGESTION_STORAGE_FAILED_CODE,
} from '../constants/ingestion.constants.js';
import {
  ingestionEnvelopeShellSchema,
  jsonDepthExceeds,
  mapUsageEventToNewUsageEvent,
  readIngestionIdempotencyKey,
} from '../utils/ingestion.util.js';

@Injectable()
export class IngestionService {
  constructor(
    private readonly _usageEventRepositoryService: UsageEventRepositoryService,
    private readonly _rejectedEventRepositoryService: RejectedEventRepositoryService,
  ) {}

  // Envelope problems are HTTP statuses; per-event outcomes are the body (ADR-0002).
  async ingest(projectId: string, body: unknown): Promise<IngestResponse> {
    const receivedAt = new Date();
    const envelope = ingestionEnvelopeShellSchema.safeParse(body);
    if (!envelope.success) throw new BadRequestException(z.prettifyError(envelope.error));

    const { sdk, events } = envelope.data;
    const response: IngestResponse = { successes: [], errors: [] };

    for (const raw of events) {
      // One event's failure, even a storage error, never fails the batch (ADR-0002).
      try {
        await this.ingestOne(projectId, raw, receivedAt, sdk, response);
      } catch (error) {
        console.error(
          `[IngestionService] project ${projectId}: storing an event failed:`,
          error instanceof Error ? error.message : 'unknown error',
        );
        const failure: IngestError = {
          code: INGESTION_STORAGE_FAILED_CODE,
          message: 'The event could not be stored; it can be sent again.',
        };
        const idempotencyKey = readIngestionIdempotencyKey(raw);
        if (idempotencyKey) failure.idempotencyKey = idempotencyKey;
        response.errors.push(failure);
      }
    }
    return response;
  }

  private async ingestOne(
    projectId: string,
    raw: unknown,
    receivedAt: Date,
    sdk: SdkIdentity,
    response: IngestResponse,
  ): Promise<void> {
    const tooDeep = jsonDepthExceeds(raw, INGESTION_MAX_EVENT_DEPTH);
    const parsed = tooDeep ? null : usageEventSchema.safeParse(raw);
    if (parsed?.success) {
      const outcome = await this._usageEventRepositoryService.insert(
        projectId,
        mapUsageEventToNewUsageEvent(parsed.data, receivedAt, sdk),
      );
      response.successes.push({
        idempotencyKey: parsed.data.idempotencyKey,
        status: outcome === 'created' ? 201 : 200,
      });
      return;
    }

    const message = parsed
      ? z.prettifyError(parsed.error)
      : `The event is nested deeper than ${INGESTION_MAX_EVENT_DEPTH} levels.`;
    const idempotencyKey = readIngestionIdempotencyKey(raw);
    await this._rejectedEventRepositoryService.insert(projectId, {
      idempotencyKey: idempotencyKey ?? null,
      receivedAt,
      payload: tooDeep || raw === undefined ? null : raw,
      issues: parsed ? parsed.error.issues : [{ code: 'too_deep', message }],
      sdkName: sdk.name,
      sdkVersion: sdk.version,
    });
    const error: IngestError = {
      code: INGESTION_INVALID_EVENT_CODE,
      message: message.slice(0, INGESTION_MAX_ERROR_MESSAGE_LENGTH),
    };
    if (idempotencyKey) error.idempotencyKey = idempotencyKey;
    response.errors.push(error);
  }
}
