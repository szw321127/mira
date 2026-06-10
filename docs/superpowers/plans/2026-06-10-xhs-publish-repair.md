# XHS Publish Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repair action that turns XHS publish-package audit findings into a re-audited, copy-ready package.

**Architecture:** Backend adds a model-backed repair endpoint in `xhs-analysis`; frontend stores the last workflow and audit so a not-ready package can be repaired without regenerating outlines.

**Tech Stack:** NestJS, Prisma-free service method, OpenAI-compatible text model adapter, Next.js, React state, existing workbench components.

---

## File Structure

- Modify `packages/backend/src/xhs-analysis/xhs-analysis.service.ts`: add repair method, text-model call, repaired package validation, and re-audit.
- Modify `packages/backend/src/xhs-analysis/xhs-analysis.controller.ts`: add repair endpoint.
- Add `packages/backend/src/xhs-analysis/dto/repair-xhs-publish-package.dto.ts`: validate idea and package payload.
- Modify `packages/backend/src/xhs-analysis/xhs-analysis.service.spec.ts`: add red/green repair service coverage.
- Modify `packages/backend/src/xhs-analysis/xhs-analysis.controller.spec.ts`: add route metadata coverage.
- Modify `packages/backend/src/xhs-analysis/xhs-analysis.module.ts`: import model config module.
- Modify `packages/web-frontend/lib/api.ts`: add repair API type/method.
- Modify `packages/web-frontend/app/workbench/types.ts`: store the current workflow/audit in snapshots.
- Modify `packages/web-frontend/app/workbench/post-editor.tsx`: add a compact repair button when audit is not ready.
- Modify `packages/web-frontend/app/page.tsx`: wire repair state/action.
- Modify `packages/web-frontend/app/workbench/workbench-design.test.mjs`: static coverage for repair wiring.

## Tasks

### Task 1: Backend Repair Endpoint

- [x] Write failing service test for repairing an unready package.
- [x] Write failing controller route test for `repair-publish-package`.
- [x] Implement DTO, service method, route, and module injection.
- [x] Run `pnpm --filter @rednote/backend test -- xhs-analysis`.
- [x] Run `cd packages/backend && pnpm exec eslint src/xhs-analysis/**/*.ts`.

### Task 2: Frontend Repair Action

- [x] Write failing workbench static tests for repair API and UI wiring.
- [x] Add API method and types.
- [x] Store latest workflow/audit in workspace state and snapshots.
- [x] Add compact repair button to the post editor action row.
- [x] Wire repair action to replace the visible post draft.
- [x] Run `pnpm --filter @rednote/web-frontend test`.
- [x] Run `pnpm --filter @rednote/web-frontend lint`.

### Task 3: Review, Verify, Commit

- [x] Run `impeccable` context/product review on the touched workbench UI.
- [x] Run `pnpm --filter @rednote/backend build`.
- [x] Run `pnpm --filter @rednote/web-frontend build`.
- [ ] Run `git diff --check`.
- [ ] Run `git diff --name-only packages/agent`.
- [ ] Commit as `feat: repair xhs publish packages`.
- [ ] Push `dev`.
