# XHS Research Driven Outlines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the real idea-to-Xiaohongshu-research-to-editable-outline pipeline.

**Architecture:** The frontend calls one authenticated backend endpoint with the current conversation and idea. The backend resolves the custom content provider, searches popular Xiaohongshu notes by generated keywords, analyzes safe metadata and patterns, persists a research run, creates an outline batch, and returns a compact summary plus three editable outlines. Low sample counts do not block generation; they lower confidence and add warnings.

**Tech Stack:** Next.js, NestJS, Prisma SQLite, Jest, shared `@rednote/agent/xhs-analysis` pure helpers.

---

### Task 1: Agent Research Helpers

**Files:**
- Modify: `packages/agent/src/xhs-analysis/index.ts`
- Modify: `packages/agent/src/xhs-analysis/index.spec.ts`

- [ ] Write failing tests for `buildXhsSearchKeywords`, `analyzeXhsPopularSamples`, and `buildXhsResearchBackedOutlines`.
- [ ] Run `pnpm test:agent -- --runInBand` and verify the new tests fail because the helpers do not exist.
- [ ] Implement keyword extraction, sample ranking/dedupe, low-confidence warnings, compliant source summaries, and three editable research-backed candidates.
- [ ] Re-run `pnpm test:agent -- --runInBand` and verify the tests pass.

### Task 2: Backend Research Persistence And API

**Files:**
- Modify: `packages/backend/prisma/schema.prisma`
- Create: `packages/backend/prisma/migrations/20260615120000_add_xhs_research_runs/migration.sql`
- Modify: `packages/backend/src/conversations/conversations.service.ts`
- Modify: `packages/backend/src/xhs-analysis/xhs-analysis.types.ts`
- Create: `packages/backend/src/xhs-analysis/dto/build-xhs-research-outlines.dto.ts`
- Modify: `packages/backend/src/xhs-analysis/xhs-analysis.controller.ts`
- Modify: `packages/backend/src/xhs-analysis/xhs-analysis.service.ts`
- Modify: `packages/backend/src/xhs-analysis/xhs-analysis.service.spec.ts`

- [ ] Write failing backend tests for provider search, partial failure, valid empty results, and low-sample editable fallback.
- [ ] Run `pnpm test:backend -- --runInBand` and verify the new tests fail because the endpoint/service method does not exist.
- [ ] Add `XhsResearchRun` relation and migration.
- [ ] Implement `POST /xhs-analysis/research/outlines` behind `JwtAuthGuard`.
- [ ] Resolve `custom` provider config, call `{baseUrl}/xhs/posts/search` with `{ keyword, limit, sort: "popular" }`, normalize `data.posts`, `data.items`, or `data.notes`.
- [ ] Persist the research run, outline batch, stale old drafts, and conversation status in one transaction.
- [ ] Re-run `pnpm test:backend -- --runInBand`.

### Task 3: Frontend Research Flow

**Files:**
- Modify: `packages/web-frontend/lib/api.ts`
- Modify: `packages/web-frontend/app/workbench/types.ts`
- Modify: `packages/web-frontend/app/workbench/workspace-utils.ts`
- Modify: `packages/web-frontend/app/workbench/outline-workspace.tsx`
- Modify: `packages/web-frontend/app/page.tsx`
- Modify or add tests under `packages/web-frontend/app/workbench/*.test.mjs`

- [ ] Add API types and `api.xhs.researchOutlines`.
- [ ] Add `latestResearch` to the workspace snapshot and restore parser.
- [ ] Replace outline generation with the research endpoint while preserving previous batches.
- [ ] Render compact research summary: keywords, confidence, warnings, patterns, and metadata-only representative sources.
- [ ] Keep UI fixed to quick mode for now.
- [ ] Run `pnpm test:frontend`.

### Task 4: Final Verification

- [ ] Run `pnpm test:agent -- --runInBand`.
- [ ] Run `pnpm test:backend -- --runInBand`.
- [ ] Run `pnpm test:frontend`.
- [ ] Run `pnpm --filter @rednote/backend prisma:generate`.
- [ ] Review `git diff` for raw source content leakage, API key logging, and unrelated changes.
