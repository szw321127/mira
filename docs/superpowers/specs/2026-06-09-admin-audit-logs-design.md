# Admin Audit Logs Design

## Goal

Add backend audit logs for high-risk admin operations so model configuration, project, and task changes are traceable before the admin surface gets full role-based access control.

## Current State

The backend already has real admin project data, task mutations, model configuration persistence, and model connection tests. Creator-facing routes use JWT guards, but admin routes are still open while the admin frontend does not yet have its own login/session flow.

This makes direct RBAC too large for the next safe step. Audit logging is smaller and still moves the project toward commercial readiness: it gives operators traceability without changing existing UI behavior or access assumptions.

## Scope

Add a Prisma-backed admin audit log subsystem:

- Persist an audit row for successful admin model configuration saves.
- Persist an audit row for successful model connection tests.
- Persist an audit row for successful project creation.
- Persist an audit row for successful task creation, update, and deletion.
- Provide a read API for the newest audit entries.
- Never store plaintext `apiKey` or encrypted key payloads in audit metadata.

This iteration does not add a new UI view, auth role model, or changes to `packages/agent`.

## Data Model

Add `AdminAuditLog`:

- `id`: cuid primary key.
- `action`: stable machine action such as `model_config.saved`.
- `targetType`: `model_config`, `project`, or `task`.
- `targetKey`: stable user-facing key or config type.
- `actor`: defaults to `system` until admin auth is introduced.
- `metadata`: JSON string.
- `createdAt`: timestamp.

Indexes:

- `createdAt` for newest-first retrieval.
- `(targetType, targetKey, createdAt)` for future filtered lookup.

## Backend Architecture

Create `AdminAuditLogsModule` with:

- `AdminAuditLogsService.record(input)`: sanitizes metadata, serializes it, and creates a Prisma row.
- `AdminAuditLogsService.list(limit)`: returns newest audit rows, capped at 100.
- `AdminAuditLogsController`: exposes `GET /admin/audit-logs`.

Import `AdminAuditLogsModule` into:

- `AdminProjectsModule`
- `AdminModelConfigsModule`

Inject `AdminAuditLogsService` into:

- `AdminProjectsService`
- `AdminModelConfigsService`

The service writes an audit entry after each successful admin mutation or model connection test. If a mutation throws, no audit entry is written.

## Metadata Redaction

Audit metadata must be useful without leaking secrets:

- Model config save metadata includes `baseUrl`, `modelName`, `hasApiKey`, and `apiKeyUpdated`.
- Model connection test metadata includes `endpoint` and `modelName`.
- Project metadata includes `name`, `owner`, `status`, and `priority`.
- Task metadata includes `name`, `assignee`, `status`, and `projectKey`.
- Any key containing `apiKey`, `apiKeyEncrypted`, `password`, `secret`, or `token` is removed recursively.

## API Shape

Successful responses continue using the global envelope:

```json
{
  "code": 0,
  "data": [
    {
      "action": "project.created",
      "actor": "system",
      "createdAt": "2026-06-09T00:00:00.000Z",
      "id": "cuid",
      "metadata": { "name": "商业化后台" },
      "targetKey": "commercial-admin",
      "targetType": "project"
    }
  ],
  "msg": "ok"
}
```

## Testing

Backend unit tests prove:

- Audit service writes sanitized metadata.
- Audit service lists logs newest first and caps limit at 100.
- Project creation records a `project.created` audit row.
- Task creation, update, and deletion record audit rows.
- Model config save records `model_config.saved` without plaintext API key.
- Model connection test records `model_config.connection_tested`.

Full verification:

- `pnpm --filter @rednote/backend test -- admin-audit-logs.service.spec.ts admin-projects.service.spec.ts admin-model-configs.service.spec.ts`
- `pnpm -r --if-present test`
- `pnpm -r --if-present build`
- `git diff --check`
