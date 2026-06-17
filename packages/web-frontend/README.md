# RedNote Web Frontend

`@rednote/web-frontend` is the Next.js workspace for talking with
`@rednote/agent`. The MVP is a local-first agent workspace: conversation
history is saved in the browser, the Next.js API route runs the agent on the
server, and model credentials never need to be exposed to client code.

## Local Setup

```bash
pnpm install
pnpm --filter @rednote/web-frontend dev
```

Open http://localhost:3000 after the dev server starts.

Create `packages/web-frontend/.env.local` before sending a real agent message:

```bash
AGENT_MODEL_BASE_URL="https://your-model-provider.example/v1"
AGENT_MODEL_API_KEY="replace-me"
AGENT_MODEL_NAME="your-chat-model"
AGENT_MAX_STEPS="8"
```

`AGENT_MAX_STEPS` is optional and defaults to `8`. The other three values are
required by `/api/agent/chat`; if they are missing, the UI shows the setup
error returned by the API instead of attempting a model call.

## Scripts

```bash
pnpm --filter @rednote/web-frontend dev
pnpm --filter @rednote/web-frontend test
pnpm --filter @rednote/web-frontend lint
pnpm --filter @rednote/web-frontend build
```

## Agent Boundary

The browser sends the active conversation to `/api/agent/chat`. The route runs
`@rednote/agent`, streams newline-delimited JSON back to the UI, and registers
only a bounded `project_context` tool for product/workflow context. Filesystem
tools are not exposed in the web route.

Credentials stay server-side in environment variables. Do not prefix them with
`NEXT_PUBLIC_`.

## MVP Persistence

The first phase stores conversations in `localStorage` only. Clearing browser
site data removes saved conversations. Backend persistence, auth, multi-device
sync, and shareable conversation links are planned for later phases.
