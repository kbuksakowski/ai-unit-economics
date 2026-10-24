import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';

import { ProjectRepositoryService } from '../data-access-layer/project-entity/providers/project.repository.service.js';
import type { AuthenticatedRequest } from '../types/authenticated-request.type.js';
import { hashApiKey, readBearerToken } from '../utils/api-key.util.js';

// Analytics only. The SDK's ingestion key lives on application servers and must not read
// which customers are expensive (ADR-0005).
@Injectable()
export class ReadKeyGuard implements CanActivate {
  constructor(private readonly _projectRepositoryService: ProjectRepositoryService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const readKey = readBearerToken(request.headers.authorization);
    if (!readKey) throw new UnauthorizedException('Missing bearer read key.');

    const project = await this._projectRepositoryService.findForReadKeyAuth(hashApiKey(readKey));
    if (!project) throw new UnauthorizedException('Unknown read key.');

    request.projectId = project.id;
    return true;
  }
}
