# Monorepo Migration Findings

- Root `package.json` already has partial monorepo scripts, but `pnpm-workspace.yaml` is missing.
- Current active directories are `backend/` and `frontend/`; legacy `rednote-backend/` and `rednote-ai-studio/` appear deleted in git status.
- `backend/src/agent/index.ts` has been adjusted by the user to only export `agentLoop` and `AgentLoopEvent`.
- `backend/` contains a nested `.git`; migration should use filesystem moves and avoid git history operations inside that nested repo.
- `frontend/` has its own `pnpm-workspace.yaml` and lockfile; the target monorepo should use the root workspace and root lockfile.
- `packages/agent/src/test.ts` is user-owned test code and must be kept. It can be exposed as the agent package `dev` script, but not as the package's main library entry.
- Active backend package after agent extraction has no source import of `agent`, so `@rednote/backend` does not need a workspace dependency on `@rednote/agent` yet.
- `next/font/google` requires network access during build. The frontend now uses local font stacks so workspace builds are deterministic offline.
- Docker was not available locally, so Dockerfile validation is limited to path/config review.
