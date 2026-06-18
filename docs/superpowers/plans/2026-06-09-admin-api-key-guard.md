# Admin API Key Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect backend admin APIs with an optional deployment-time API key without changing the admin UI or local development flow.

**Architecture:** Add a Nest guard that reads `ADMIN_API_KEY`, allows all admin requests when it is unset, and validates `x-admin-api-key` when it is set. Apply the guard to every current admin controller and add frontend request header propagation from `VITE_ADMIN_API_KEY`.

**Tech Stack:** NestJS, `@nestjs/config`, Jest, TypeScript, Vite environment variables, native `fetch`.

---

## File Map

- Add `packages/backend/src/admin-security/admin-api-key.guard.ts`: optional API key guard.
- Add `packages/backend/src/admin-security/admin-api-key.guard.spec.ts`: guard unit tests.
- Modify `packages/backend/src/admin-projects/admin-projects.controller.ts`: add guard.
- Modify `packages/backend/src/admin-model-configs/admin-model-configs.controller.ts`: add guard.
- Modify `packages/backend/src/admin-audit-logs/admin-audit-logs.controller.ts`: add guard.
- Modify `packages/backend/src/admin-projects/admin-projects.module.ts`: provide guard.
- Modify `packages/backend/src/admin-model-configs/admin-model-configs.module.ts`: provide guard.
- Modify `packages/backend/src/admin-audit-logs/admin-audit-logs.module.ts`: provide guard.
- Modify `packages/admin-frontend/src/api.ts`: add `VITE_ADMIN_API_KEY` header support.
- Modify `packages/admin-frontend/src/admin-design.test.mjs`: assert header support and controller guard usage.

## Tasks

### Task 1: Guard Unit Tests

- [x] **Step 1: Write failing guard tests**

Create `packages/backend/src/admin-security/admin-api-key.guard.spec.ts` with tests for unset key, missing header, wrong header, and correct header.

- [x] **Step 2: Run RED**

Run: `pnpm --filter @rednote/backend test -- admin-api-key.guard.spec.ts`

Expected: FAIL because `AdminApiKeyGuard` does not exist.

- [x] **Step 3: Implement guard**

Create `packages/backend/src/admin-security/admin-api-key.guard.ts` with a Nest `CanActivate` implementation that reads `ADMIN_API_KEY` and compares the `x-admin-api-key` header using hashed `timingSafeEqual`.

- [x] **Step 4: Run GREEN**

Run: `pnpm --filter @rednote/backend test -- admin-api-key.guard.spec.ts`

Expected: PASS.

### Task 2: Admin Controller Guard Coverage

- [x] **Step 1: Add failing static tests**

Extend `packages/backend/src/admin-security/admin-api-key.guard.spec.ts` or add simple source assertions to prove each current admin controller references `AdminApiKeyGuard`.

- [x] **Step 2: Run RED**

Run: `pnpm --filter @rednote/backend test -- admin-api-key.guard.spec.ts`

Expected: FAIL because controllers are not guarded.

- [x] **Step 3: Add guard to controllers and providers**

Add `@UseGuards(AdminApiKeyGuard)` to:

- `packages/backend/src/admin-projects/admin-projects.controller.ts`
- `packages/backend/src/admin-model-configs/admin-model-configs.controller.ts`
- `packages/backend/src/admin-audit-logs/admin-audit-logs.controller.ts`

Add `AdminApiKeyGuard` to providers in each corresponding module.

- [x] **Step 4: Run GREEN**

Run: `pnpm --filter @rednote/backend test -- admin-api-key.guard.spec.ts`

Expected: PASS.

### Task 3: Admin Frontend Header Support

- [x] **Step 1: Add failing static test**

Modify `packages/admin-frontend/src/admin-design.test.mjs` to assert:

- `VITE_ADMIN_API_KEY`
- `x-admin-api-key`

- [x] **Step 2: Run RED**

Run: `pnpm --filter @rednote/admin-frontend test`

Expected: FAIL because header support is missing.

- [x] **Step 3: Add header support**

Modify `packages/admin-frontend/src/api.ts`:

- Add `const ADMIN_API_KEY = import.meta.env.VITE_ADMIN_API_KEY?.trim();`
- In `request()`, set `headers.set("x-admin-api-key", ADMIN_API_KEY)` only when configured.

- [x] **Step 4: Run GREEN**

Run: `pnpm --filter @rednote/admin-frontend test`

Expected: PASS.

### Task 4: Verification and Commit

- [x] Run `pnpm --filter @rednote/backend exec prettier --write "src/**/*.ts"`.
- [x] Run `pnpm --filter @rednote/backend exec prettier --write ../admin-frontend/src/api.ts ../admin-frontend/src/admin-design.test.mjs`.
- [x] Run `pnpm --filter @rednote/backend test -- admin-api-key.guard.spec.ts`.
- [x] Run `pnpm --filter @rednote/admin-frontend test`.
- [x] Run `pnpm -r --if-present test`.
- [x] Run `pnpm -r --if-present build`.
- [x] Run `git diff --check`.
- [x] Start backend without `ADMIN_API_KEY`, verify `GET /admin/audit-logs` returns `200`.
- [x] Start backend with `ADMIN_API_KEY=codex-secret`, verify missing header returns `401` and correct header returns `200`.
Commit and push are performed by the outer workflow after this checklist is verified.
