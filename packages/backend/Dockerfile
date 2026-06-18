FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/agent/package.json packages/agent/package.json
COPY packages/backend/package.json packages/backend/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY packages/agent packages/agent
COPY packages/backend packages/backend
RUN pnpm --filter @rednote/backend build
RUN pnpm --filter @rednote/backend deploy --legacy --prod /prod/backend

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /prod/backend ./
EXPOSE 3000
CMD ["pnpm", "start:prod"]
