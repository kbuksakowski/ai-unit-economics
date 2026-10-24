import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';

import type { AuthenticatedRequest } from '../types/authenticated-request.type.js';

// Only meaningful behind ApiKeyGuard or ReadKeyGuard; throws rather than return undefined if used without it.
export const ProjectId = createParamDecorator((_: unknown, context: ExecutionContext): string => {
  const projectId = context.switchToHttp().getRequest<AuthenticatedRequest>().projectId;
  if (projectId === undefined) throw new UnauthorizedException();
  return projectId;
});
