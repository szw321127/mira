# Publish Ready Admin Keyring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make publish packages look like final publishable content and add mature admin model keyring management.

**Architecture:** Keep creator publish rendering in `web-frontend` while reinforcing the backend generation prompt. Add a Prisma `AdminModelApiKey` table and expose keyring CRUD through admin model config APIs. Update the Ant Design admin shell with a collapsible sidebar and keyring controls.

**Tech Stack:** Next.js React, Vite React, Ant Design, NestJS, Prisma SQLite migrations, Jest, node test runner, pnpm.

---

## File Map

- Modify `packages/web-frontend/app/workbench/post-editor.tsx`: publish-ready layout and disclosure for image prompt.
- Modify `packages/web-frontend/app/workbench/workbench-design.test.mjs`: static assertions for final-note structure.
- Modify `packages/backend/src/generation/generation.service.ts`: prompt language for publish-ready sections.
- Modify `packages/backend/src/generation/generation.service.spec.ts`: prompt assertions.
- Modify `packages/backend/prisma/schema.prisma`: add `AdminModelApiKey`.
- Add `packages/backend/prisma/migrations/20260609090000_add_admin_model_api_keys/migration.sql`: SQLite migration and legacy key copy.
- Modify `packages/backend/src/admin-model-configs/admin-model-configs.types.ts`: keyring view/runtime types.
- Modify `packages/backend/src/admin-model-configs/admin-model-configs.service.ts`: keyring CRUD and runtime selection.
- Modify `packages/backend/src/admin-model-configs/admin-model-configs.service.spec.ts`: keyring tests.
- Add `packages/backend/src/admin-model-configs/dto/create-admin-model-api-key.dto.ts`: create key DTO.
- Add `packages/backend/src/admin-model-configs/dto/update-admin-model-api-key.dto.ts`: patch key DTO.
- Modify `packages/backend/src/admin-model-configs/admin-model-configs.controller.ts`: keyring endpoints.
- Modify `packages/admin-frontend/index.html`: document title.
- Modify `packages/admin-frontend/src/api.ts`: keyring types and helpers.
- Modify `packages/admin-frontend/src/App.tsx`: collapsible sidebar and keyring UI.
- Modify `packages/admin-frontend/src/styles.css`: collapsed sidebar and keyring layout.
- Modify `packages/admin-frontend/src/admin-design.test.mjs`: static assertions.

## Tasks

### Task 1: RED Tests

- [ ] Add web static assertions for publish-ready layout.
- [ ] Add admin static assertions for head title, collapsible sidebar, and keyring helpers.
- [ ] Add backend service tests for multiple API keys.
- [ ] Add backend generation prompt assertion.
- [ ] Run focused tests and confirm failures:
  - `pnpm --filter @rednote/web-frontend test`
  - `pnpm --filter @rednote/admin-frontend test`
  - `pnpm --filter @rednote/backend test -- admin-model-configs.service.spec.ts generation.service.spec.ts`

### Task 2: Backend Keyring

- [ ] Add Prisma schema and migration for `AdminModelApiKey`.
- [ ] Add create/update DTOs.
- [ ] Extend model config types and service with `addApiKey`, `updateApiKey`, `deleteApiKey`.
- [ ] Update runtime config to use the first enabled key.
- [ ] Add controller endpoints.
- [ ] Run backend focused tests until green.

### Task 3: Creator Publish Package UI

- [ ] Update `PostEditor` to show `最终笔记` as the primary publish preview.
- [ ] Rename visible `正文结构` to `正文段落`.
- [ ] Move `imagePrompt` under `封面生成参数`.
- [ ] Update generation prompt wording.
- [ ] Run web focused test until green.

### Task 4: Admin UI

- [ ] Update document title.
- [ ] Add desktop sidebar collapsed state and icon-only rail behavior.
- [ ] Add keyring API helpers and UI controls.
- [ ] Run admin focused test until green.

### Task 5: Verification

- [ ] Run Prettier for touched TS/TSX/CSS files.
- [ ] Run Prisma generate.
- [ ] Run focused backend/admin/web tests.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm build`.
- [ ] Run `git diff --check`.
- [ ] Run local browser review and `$impeccable` critique/audit for changed UI.
- [ ] Commit and push.
