# Backend XHS Analysis Domain Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Xiaohongshu analysis helpers out of `@rednote/agent` and into backend-owned domain modules so `pnpm dev:backend` no longer loads ESM agent source.

**Architecture:** Backend owns the XHS analysis domain under `packages/backend/src/xhs-analysis/domain`. The domain is split by responsibility and re-exported from `domain/index.ts`; backend services, DTOs, and utils import from that local module. The agent package no longer exports `xhs-analysis`.

**Tech Stack:** NestJS backend, TypeScript, Prisma, Jest, pnpm monorepo.

---

### Task 1: Create Backend Domain Modules

**Files:**
- Create: `packages/backend/src/xhs-analysis/domain/*.ts`
- Modify: `packages/backend/src/xhs-analysis/domain/index.ts`

- [ ] Move existing pure analysis types and functions into backend.
- [ ] Split files by responsibility: types, shared utilities, post/account analysis, briefs, outlines, research, publish package, publish audit, imports, commercial workflow.
- [ ] Keep exported function/type names unchanged.

### Task 2: Rewire Backend Imports

**Files:**
- Modify: `packages/backend/src/xhs-analysis/**/*.ts`
- Modify: `packages/backend/package.json`
- Modify: `packages/agent/src/index.ts`

- [ ] Replace `@rednote/agent/xhs-analysis` imports with local `./domain` or `../domain`.
- [ ] Remove Jest module mapper for `@rednote/agent/xhs-analysis`.
- [ ] Remove agent package export for `./xhs-analysis`.

### Task 3: Remove Agent Copy

**Files:**
- Delete: `packages/agent/src/xhs-analysis/index.ts`
- Delete: `packages/agent/src/xhs-analysis/index.spec.ts`

- [ ] Ensure no backend code depends on agent source.
- [ ] Ensure agent build still passes.

### Task 4: Verify

**Commands:**
- `pnpm test:backend`
- `pnpm build:backend`
- `pnpm test:agent`
- `pnpm test:frontend`
- `pnpm dev:backend`

- [ ] Confirm backend dev no longer fails with `ERR_REQUIRE_ESM`.
- [ ] Stop the dev watcher after it reaches the Nest startup point.
