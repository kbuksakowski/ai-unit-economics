import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';

import { ProjectRepositoryService } from '../data-access-layer/project-entity/providers/project.repository.service.js';
import type { AuthenticatedRequest } from '../types/authenticated-request.type.js';
import { hashApiKey, readBearerToken } from '../utils/api-key.util.js';

// The key resolves to a project, and the project — never a request field — scopes every write.
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly _projectRepositoryService: ProjectRepositoryService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const apiKey = readBearerToken(request.headers.authorization);
    if (!apiKey) throw new UnauthorizedException('Missing bearer API key.');

    const project = await this._projectRepositoryService.findForIngestionKeyAuth(
      hashApiKey(apiKey),
    );
    if (!project) throw new UnauthorizedException('Unknown API key.');

    request.projectId = project.id;
    return true;
  }
}
