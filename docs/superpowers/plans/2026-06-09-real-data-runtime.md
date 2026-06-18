# Real Data Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace runtime mock data with persisted admin project data and configured text/image model providers.

**Architecture:** Backend services own all real data and provider calls. Frontends keep consuming wrapped backend APIs. Tests use mocks only to isolate provider/database behavior.

**Tech Stack:** NestJS, Prisma SQLite, React, Vite, Ant Design, Next.js, native `fetch`.

---

## File Map

- Modify `packages/backend/prisma/schema.prisma`: add admin project/task/notification models.
- Add `packages/backend/prisma/migrations/20260609043000_add_admin_project_management/migration.sql`: create admin project tables.
- Modify `packages/backend/src/admin-model-configs/admin-model-configs.service.ts`: expose runtime config resolver.
- Modify `packages/backend/src/admin-model-configs/admin-model-configs.module.ts`: export service for generation modules.
- Add `packages/backend/src/model-provider/openai-compatible.ts`: shared request, endpoint, JSON parsing helpers.
- Modify `packages/backend/src/generation/generation.service.ts`: call configured text model.
- Modify `packages/backend/src/generation/generation.module.ts`: import model config module.
- Modify `packages/backend/src/conversations/conversations.service.ts`: await async generation methods.
- Modify `packages/backend/src/image-generation/image-generation.service.ts`: call configured image model.
- Modify `packages/backend/src/image-generation/image-generation.module.ts`: remove mock provider and import model config module.
- Delete or orphan `packages/backend/src/image-generation/mock-image.provider.ts`: no production mock provider.
- Modify `packages/backend/src/admin-projects/admin-projects.service.ts`: read/create Prisma records.
- Modify `packages/backend/src/admin-projects/admin-projects.controller.ts`: add project creation endpoint.
- Add `packages/backend/src/admin-projects/dto/create-admin-project.dto.ts`: validate create payload.
- Modify `packages/admin-frontend/src/api.ts`: add create project API.
- Modify `packages/admin-frontend/src/App.tsx`: turn new project modal into real form.
- Modify `packages/admin-frontend/src/admin-design.test.mjs`: assert real project creation API/UI.

## Tasks

### Task 1: Runtime Model Config

- [ ] Write failing tests in `packages/backend/src/admin-model-configs/admin-model-configs.service.spec.ts` for `getRuntimeConfig('text')`.
- [ ] Run `pnpm --filter @rednote/backend test -- admin-model-configs.service.spec.ts` and verify the new tests fail because `getRuntimeConfig` is missing.
- [ ] Implement `getRuntimeConfig`, export `AdminModelConfigsService`, and keep public views redacted.
- [ ] Re-run the same backend test and verify it passes.

### Task 2: Text Generation Provider

- [ ] Write failing tests in `packages/backend/src/generation/generation.service.spec.ts` for outline generation using a mocked `fetch` and text model config.
- [ ] Write failing tests for malformed text model JSON.
- [ ] Implement OpenAI-compatible chat-completions calls and strict JSON parsing.
- [ ] Update `ConversationsService` to `await` generation methods.
- [ ] Run `pnpm --filter @rednote/backend test -- generation.service.spec.ts`.

### Task 3: Image Generation Provider

- [ ] Replace mock image provider tests with image provider HTTP tests in `packages/backend/src/image-generation/image-generation.service.spec.ts`.
- [ ] Implement OpenAI-compatible image generation.
- [ ] Update image generation module providers.
- [ ] Run `pnpm --filter @rednote/backend test -- image-generation.service.spec.ts`.

### Task 4: Admin Project Persistence

- [ ] Add Prisma admin project/task/notification models and migration.
- [ ] Write failing `AdminProjectsService` tests for empty dashboard, populated dashboard metrics, and project creation.
- [ ] Implement Prisma-backed `getDashboard()` and `createProject()`.
- [ ] Add `POST /admin/projects` controller route and DTO.
- [ ] Run `pnpm --filter @rednote/backend test -- admin-projects.service.spec.ts`.

### Task 5: Admin Frontend Project Creation

- [ ] Add `createAdminProject()` to `packages/admin-frontend/src/api.ts`.
- [ ] Replace the placeholder "新建项目" modal with an Ant Design form that posts real project data and reloads dashboard data.
- [ ] Update admin frontend static tests to assert the real API and form.
- [ ] Run `pnpm --filter @rednote/admin-frontend test`.

### Task 6: Verification and UI Review

- [ ] Run `pnpm --filter @rednote/backend test -- admin-model-configs.service.spec.ts generation.service.spec.ts image-generation.service.spec.ts admin-projects.service.spec.ts`.
- [ ] Run `pnpm --filter @rednote/backend build`.
- [ ] Run `pnpm --filter @rednote/admin-frontend test`.
- [ ] Run `pnpm --filter @rednote/admin-frontend build`.
- [ ] Start backend and admin frontend, create a project, and verify dashboard updates.
- [ ] Run `$impeccable` review for the admin UI changes and fix any P0/P1 findings.

