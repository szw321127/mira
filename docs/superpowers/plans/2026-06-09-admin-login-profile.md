# Admin Login Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin login, initial administrator bootstrap, and an administrator information page with password change.

**Architecture:** Backend gets a standalone `admin-auth` Nest module and `AdminUser` Prisma model. Admin controllers switch from browser API-key protection to a scoped admin JWT guard. The admin frontend stores an admin JWT, sends Bearer tokens, gates the app shell behind login, and adds a profile page.

**Tech Stack:** NestJS, Prisma SQLite, `@nestjs/jwt`, argon2, React, Vite, Ant Design, native `fetch`, Node test runner, Jest.

---

## File Map

- Modify `packages/backend/prisma/schema.prisma`: add `AdminUser`.
- Add `packages/backend/prisma/migrations/20260609110000_add_admin_users/migration.sql`: create admin user table.
- Add `packages/backend/src/admin-auth/*`: service, controller, module, guard, decorator, DTOs, and tests.
- Modify `packages/backend/src/app.module.ts`: import admin auth module.
- Modify current admin controllers/modules: use `AdminJwtAuthGuard`.
- Modify `packages/backend/src/admin-security/admin-api-key.guard.spec.ts`: keep legacy guard tests, assert admin controllers use admin JWT.
- Modify `packages/admin-frontend/src/api.ts`: admin token helpers and auth endpoints.
- Modify `packages/admin-frontend/src/App.tsx`: login gate, session state, profile page, logout.
- Modify `packages/admin-frontend/src/styles.css`: compact login and profile layout.
- Modify `packages/admin-frontend/src/admin-design.test.mjs`: static tests for login/profile and Bearer auth.

## Tasks

### Task 1: Backend Auth Tests

- [ ] Add `packages/backend/src/admin-auth/admin-auth.service.spec.ts` for bootstrap, login, profile update, and password change.
- [ ] Add `packages/backend/src/admin-auth/admin-jwt-auth.guard.spec.ts` for missing token, wrong scope, and valid admin payload.
- [ ] Update `packages/backend/src/admin-security/admin-api-key.guard.spec.ts` so admin controllers must reference `AdminJwtAuthGuard`.
- [ ] Run `pnpm --filter @rednote/backend test -- admin-auth.service.spec.ts admin-jwt-auth.guard.spec.ts admin-api-key.guard.spec.ts` and confirm the new assertions fail because the module does not exist yet.

### Task 2: Backend Implementation

- [ ] Add the `AdminUser` Prisma model and SQL migration.
- [ ] Implement admin DTOs, types, controller, service, module, current-user decorator, and JWT guard.
- [ ] Import `AdminAuthModule` in `AppModule`.
- [ ] Replace `AdminApiKeyGuard` usage in current admin controllers with `AdminJwtAuthGuard`.
- [ ] Import `AdminAuthModule` in admin feature modules so the guard can be resolved.
- [ ] Run the focused backend tests until they pass.

### Task 3: Frontend Tests

- [ ] Update `packages/admin-frontend/src/admin-design.test.mjs` to assert admin auth API functions, Bearer token usage, no exposed admin API key, login UI, profile UI, password change UI, and logout UI.
- [ ] Run `pnpm --filter @rednote/admin-frontend test` and confirm it fails before implementation.

### Task 4: Frontend Implementation

- [ ] Replace `VITE_ADMIN_API_KEY` request logic with admin token helpers and `Authorization: Bearer`.
- [ ] Add `loginAdmin`, `loadAdminProfile`, `updateAdminProfile`, and `changeAdminPassword` API calls.
- [ ] Gate `App` with a compact login screen when no valid admin session exists.
- [ ] Add `管理员信息` navigation and a profile/password page.
- [ ] Clear session on logout and on authenticated `401` errors.
- [ ] Run admin frontend tests until they pass.

### Task 5: Verification

- [ ] Run focused backend auth tests.
- [ ] Run `pnpm --filter @rednote/admin-frontend test`.
- [ ] Run `pnpm --filter @rednote/backend build`.
- [ ] Run `pnpm --filter @rednote/admin-frontend build`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm build`.
- [ ] Run `git diff --check`.
- [ ] Run the impeccable detector on changed admin frontend files and address actionable UI issues.
