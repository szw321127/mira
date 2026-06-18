# Mira Web Frontend

`@mira/web-frontend` is the Next.js workspace for Mira chat. The UI stays
local-first for conversation history, while `/api/agent/chat` proxies streaming
requests to the NestJS backend so model credentials never need to be exposed to
client code.

## Local Setup

```bash
pnpm install
pnpm dev:backend
pnpm --filter @mira/web-frontend dev
```

Open http://localhost:3000 after the dev server starts.

Create a root `.env` or `packages/backend/.env` before sending a real agent
message:

```bash
AGENT_MODEL_BASE_URL="https://your-model-provider.example/v1"
AGENT_MODEL_API_KEY="replace-me"
AGENT_MODEL_NAME="your-chat-model"
AGENT_MAX_STEPS="8"
TAVILY_API_KEY="replace-me"
```

`AGENT_MAX_STEPS` is optional and defaults to `8`. The other three values are
required by the backend `/agent/chat`; if they are missing, the UI shows the
setup error returned by the API instead of attempting a model call.

If the backend is not running on port `3001`, set the proxy target in
`packages/web-frontend/.env.local`:

```bash
BACKEND_AGENT_BASE_URL="http://localhost:3001"
```

## Scripts

```bash
pnpm --filter @mira/web-frontend dev
pnpm --filter @mira/web-frontend test
pnpm --filter @mira/web-frontend lint
pnpm --filter @mira/web-frontend build
```

## Agent Boundary

The browser sends the active conversation to `/api/agent/chat`. The route runs
as a thin proxy to the NestJS backend, which owns `@rednote/agent`, model
configuration, and the web search tool. Filesystem tools are not exposed in the
web route.

Credentials stay server-side in environment variables. Do not prefix them with
`NEXT_PUBLIC_`.

## MVP Persistence

The first phase stores conversations in `localStorage` only. Clearing browser
site data removes saved conversations. Backend persistence, auth, multi-device
sync, and shareable conversation links are planned for later phases.
