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

Create a root `.env` or `packages/backend/.env` for backend infrastructure:

```bash
AGENT_MAX_STEPS="8"
SESSION_SECRET="replace-me-with-a-long-random-string"
```

`AGENT_MAX_STEPS` is optional and defaults to `30`. Model and web search keys
are stored by the backend in PostgreSQL; log in to `/admin` and configure the
model Base URL, model name, model API key, and Tavily search key there before
sending a real agent message.

If the backend is not running on port `3001`, set the proxy target in
`packages/web-frontend/.env.local`:

```bash
BACKEND_AGENT_BASE_URL="http://localhost:3001"
```

Open http://localhost:3000/admin for the admin console. Configure the initial
administrator in the root `.env` or `packages/backend/.env`:

```bash
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="replace-me"
SESSION_SECRET="replace-me-with-a-long-random-string"
```

After logging in, the admin console can update the password and managed service
keys. Password changes and key overrides are stored by the backend in PostgreSQL
and are not exposed through `NEXT_PUBLIC_` variables.

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
`NEXT_PUBLIC_`. Model and web search provider credentials are stored in
PostgreSQL through the admin console instead of deployment env files.

## MVP Persistence

The first phase stores conversations in `localStorage` only. Clearing browser
site data removes saved conversations. Backend persistence, auth, multi-device
sync, and shareable conversation links are planned for later phases.
