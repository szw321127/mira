# Monorepo Migration Plan

## Goal

Move the project into a pnpm monorepo with `packages/agent`, `packages/backend`, and `packages/web-frontend`, with `agent` acting only as a library package that exports `agentLoop`.

## Phases

1. [complete] Capture current layout and user constraints.
2. [complete] Move current `backend/` and `frontend/` into `packages/`.
3. [complete] Extract `backend/src/agent` into `packages/agent/src`.
4. [complete] Update workspace package metadata and scripts.
5. [complete] Update TypeScript, Jest, Nest, and import paths.
6. [complete] Run targeted verification and document remaining issues.

## Constraints

- Preserve user changes already present in the dirty worktree.
- Do not make `packages/agent` executable; it only exports agent library APIs.
- Preserve `packages/agent/src/test.ts` as the user's manual local testing script.
- Avoid destructive git operations.
- Keep migration focused on current `backend/` and `frontend/`, not deleted legacy `rednote-*` directories.

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| `next/font/google` failed to fetch Geist fonts during `@rednote/web-frontend` build | First frontend build after migration | Removed `next/font/google` usage and used local CSS font stacks in `globals.css`. |
| `docker --version` command not found | Docker verification | Docker is not installed/available in this environment; Dockerfiles were added but image builds were not run locally. |
