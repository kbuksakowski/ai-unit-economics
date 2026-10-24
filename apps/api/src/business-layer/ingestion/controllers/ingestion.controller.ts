import type { IngestResponse } from '@ai-unit-economics/contracts';
import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';

import { ProjectId } from '../../../decorators/project-id.decorator.js';
import { ApiKeyGuard } from '../../../guards/api-key.guard.js';
import { IngestionService } from '../services/ingestion.service.js';

@Controller('v1/usage')
export class IngestionController {
  constructor(private readonly _ingestionService: IngestionService) {}

  // 200 for any well-formed envelope, even when every event in it failed (ADR-0002).
  @Post()
  @HttpCode(200)
  @UseGuards(ApiKeyGuard)
  async ingest(@ProjectId() projectId: string, @Body() body: unknown): Promise<IngestResponse> {
    return this._ingestionService.ingest(projectId, body);
  }
}
