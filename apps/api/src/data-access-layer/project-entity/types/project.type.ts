import type { ProjectEntity } from '../entities/project.entity.js';

export type ProjectForKeyAuth = Pick<ProjectEntity, 'id'>;
