# Admin API Key Guard Design

## Goal

Add a configurable security boundary for backend admin APIs before the project grows into a full RBAC-backed admin product.

## Current State

The backend has real admin data, model configuration, task mutation APIs, and audit logs. Creator-facing APIs use JWT guards, but admin endpoints under `/admin/*` are open so the admin frontend can still work without a dedicated login flow.

Full admin RBAC would require user roles, admin frontend session handling, token propagation, and role-specific UX. That is the right longer-term direction, but it is larger than the next safe production hardening step.

## Design

Add an `AdminApiKeyGuard`:

- Reads `ADMIN_API_KEY` from backend config.
- If `ADMIN_API_KEY` is empty, allows requests so local development and current demos keep working.
- If `ADMIN_API_KEY` is set, requires request header `x-admin-api-key`.
- Compares hashes with `timingSafeEqual`.
- Throws `UnauthorizedException('Invalid admin API key.')` when the key is missing or wrong.

Apply the guard to:

- `AdminProjectsController`
- `AdminModelConfigsController`
- `AdminAuditLogsController`

Add admin frontend request support:

- Reads `VITE_ADMIN_API_KEY`.
- If configured, every admin frontend request sends `x-admin-api-key`.
- If absent, no header is sent.

## Non-Goals

- No UI changes.
- No `packages/agent` changes.
- No role model or admin login flow in this iteration.
- No hard production startup failure when `ADMIN_API_KEY` is unset.

## Testing

Backend:

- Guard allows requests when `ADMIN_API_KEY` is unset.
- Guard rejects missing or wrong headers when `ADMIN_API_KEY` is set.
- Guard accepts the correct header.
- Admin controllers reference the guard.

Frontend:

- API request helper reads `VITE_ADMIN_API_KEY`.
- API request helper sets `x-admin-api-key` when configured.

Verification:

- Backend guard unit tests.
- Admin frontend static tests.
- Full workspace tests and build.
- Local HTTP check with and without `ADMIN_API_KEY` when practical.
