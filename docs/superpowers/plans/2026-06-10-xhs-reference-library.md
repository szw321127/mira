# XHS Reference Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist, list, restore, and delete conversation-scoped Xiaohongshu account/post references so restored workbench sessions keep their reference signals.

**Architecture:** The backend exposes protected XHS reference list/delete endpoints backed by the existing `XhsReference` Prisma model. The frontend maps those backend records into the existing `referenceImport` state so current generation code can keep reading one state shape.

**Tech Stack:** NestJS, Prisma, Jest, Next.js, React, TypeScript, Tailwind CSS, existing API wrapper.

---

## File Structure

- Modify `packages/backend/src/xhs-analysis/xhs-analysis.service.ts`: add list/delete methods, JSON parsing helpers, and exported reference response type.
- Modify `packages/backend/src/xhs-analysis/xhs-analysis.controller.ts`: add protected list/delete routes.
- Modify `packages/backend/src/xhs-analysis/xhs-analysis.service.spec.ts`: add tests for owned list/delete behavior.
- Modify `packages/backend/src/xhs-analysis/xhs-analysis.controller.spec.ts`: add route metadata test.
- Modify `packages/web-frontend/lib/api.ts`: add reference response type plus list/delete methods.
- Modify `packages/web-frontend/app/workbench/types.ts`: add optional backend reference id to imported reference state.
- Modify `packages/web-frontend/app/workbench/workspace-utils.ts`: preserve reference ids during snapshot mapping.
- Modify `packages/web-frontend/app/page.tsx`: load backend references when opening/restoring conversations and delete backend references from the importer.
- Modify `packages/web-frontend/app/workbench/workbench-design.test.mjs`: add static coverage for list/delete/restore wiring.

## Tasks

### Task 1: Backend Reference API

- [ ] Add service tests proving `listReferences(userId, conversationId)` checks ownership, sorts newest first, and parses JSON payloads.
- [ ] Add service test proving `deleteReference(userId, referenceId)` checks ownership and deletes only owned records.
- [ ] Implement `listReferences` and `deleteReference` in `XhsAnalysisService`.
- [ ] Add controller tests for `GET /conversations/:conversationId/xhs-references`.
- [ ] Implement `GET /conversations/:conversationId/xhs-references` and `DELETE /xhs-references/:referenceId`.
- [ ] Run `pnpm --filter @rednote/backend test -- xhs-analysis`.
- [ ] Run `cd packages/backend && pnpm exec eslint src/xhs-analysis/**/*.ts`.

### Task 2: Frontend Restore/Delete Wiring

- [ ] Add API types and methods for `listReferences` and `deleteReference`.
- [ ] Add static tests that the workbench loads references on conversation restore and calls delete for backend references.
- [ ] Map backend reference records into the existing imported account/post analysis state.
- [ ] Load references after opening/restoring a conversation and merge them into `referenceImport`.
- [ ] Delete backend reference records when a restored/imported reference is removed.
- [ ] Run `pnpm --filter @rednote/web-frontend test`.
- [ ] Run `pnpm --filter @rednote/web-frontend lint`.

### Task 3: Review, Build, Commit

- [ ] Run impeccable setup/context and review the touched workbench UI for visual regressions.
- [ ] Run `pnpm --filter @rednote/backend build`.
- [ ] Run `pnpm --filter @rednote/web-frontend build`.
- [ ] Run `git diff --check`.
- [ ] Run `git diff --name-only packages/agent` and confirm no output.
- [ ] Commit implementation as `feat: restore xhs reference library`.
- [ ] Push `dev`.
