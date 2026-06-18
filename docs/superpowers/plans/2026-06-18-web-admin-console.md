# Web Admin Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a protected `/admin` page in `@mira/web-frontend` for managing model/search keys and administrator account information, with password login and password change support.

**Architecture:** The NestJS backend owns admin authentication, httpOnly session cookies, password hashing, and a local admin store. The Next.js frontend owns only UI and same-origin `/api/admin/*` proxy routes to avoid exposing tokens or credentials to browser storage.

**Tech Stack:** NestJS, Node `crypto`, filesystem JSON store, Next.js App Router, React, Tailwind CSS, Node test runner, Jest/Supertest.

---

### Task 1: Backend Admin API

**Files:**
- Create: `packages/backend/src/admin/admin.types.ts`
- Create: `packages/backend/src/admin/admin-store.ts`
- Create: `packages/backend/src/admin/admin-auth.ts`
- Create: `packages/backend/src/admin/admin.service.ts`
- Create: `packages/backend/src/admin/admin.controller.ts`
- Create: `packages/backend/src/admin/admin.module.ts`
- Create: `packages/backend/src/admin/admin.controller.spec.ts`
- Modify: `packages/backend/src/app.module.ts`

- [ ] Add tests for login failure, login success cookie, session check, password change, and secret update.
- [ ] Implement password hashing with `scrypt`, signed session cookies with HMAC, and a local `.admin-store.json`.
- [ ] Wire `AdminModule` into `AppModule`.
- [ ] Verify `pnpm --filter @rednote/backend test`.

### Task 2: Web Admin Proxy

**Files:**
- Create: `packages/web-frontend/src/app/api/admin/[...path]/route.ts`
- Create: `packages/web-frontend/src/app/api/admin/proxy.test.mjs`

- [ ] Add static tests that proxy forwards cookies and targets `/admin/*` on backend.
- [ ] Implement GET/POST/PUT proxy while preserving backend `set-cookie`.
- [ ] Verify `pnpm --filter @mira/web-frontend test`.

### Task 3: Web Admin Page

**Files:**
- Create: `packages/web-frontend/src/app/admin/page.tsx`
- Create: `packages/web-frontend/src/app/admin/admin-shell.tsx`
- Create: `packages/web-frontend/src/app/admin/admin-types.ts`
- Create: `packages/web-frontend/src/app/admin/admin-copy.test.mjs`

- [ ] Add static tests for login, password change, key management, and no token/localStorage usage.
- [ ] Implement login view and authenticated dashboard.
- [ ] Use Tailwind classes and existing visual tokens; no custom CSS unless unavoidable.
- [ ] Verify lint and build.

### Task 4: Env And Verification

**Files:**
- Modify: `.env.example`
- Modify: `packages/web-frontend/README.md`

- [ ] Document `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `ADMIN_SESSION_SECRET`.
- [ ] Run `pnpm test`, `pnpm build`, backend lint, web lint.
- [ ] Commit and push.
