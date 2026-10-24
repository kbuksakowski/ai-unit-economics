# data-access-layer — invariants

Read before adding an entity or a repository method. Reasoning: ADR-0005, ADR-0009 and
`docs/architecture.md` ("Inside `apps/api`").

- **Facts are insert-only.** Repositories have no `update`, `save` or `delete`, and they do
  not extend a base class that would provide them. A correction is a new row with a
  `supersedes` pointer.
- **Every method takes `projectId` as its first argument.** Scoping lives here, not in the
  controllers, so a new endpoint cannot forget the filter. Exceptions: methods suffixed
  `AcrossProjects`, used by the background fact-derivation loop and never from code that
  serves a request; and `ProjectRepositoryService`, which is how a project is found from a
  key.
- **Reads always `select`** and return a projection named `<Entity>For<UseCase>` from
  `types/`. Exceptions: `findAllByProjectId` and `findCurrentByProjectId`, which return full
  rows for inspection in tests and are marked in the code.
- **Entities match migrations 1:1.** `@Index` names are identical to the SQL; columns carry an
  explicit `name:`, because migrations are written by hand, without a naming strategy.
- `business-layer` imports from here, never the other way round.
