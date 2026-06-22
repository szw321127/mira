# syntax=docker/dockerfile:1.7

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PNPM_STORE_DIR="/pnpm/store"
ENV PATH="$PNPM_HOME:$PATH"
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/agent/package.json packages/agent/package.json
COPY packages/backend/package.json packages/backend/package.json
RUN --mount=type=cache,id=pnpm-backend,target=/pnpm/store \
  pnpm install --frozen-lockfile --store-dir=/pnpm/store

FROM deps AS builder
COPY packages/agent packages/agent
COPY packages/backend packages/backend
RUN pnpm --filter @rednote/backend build
RUN pnpm --filter @rednote/backend deploy --legacy --prod /prod/backend
RUN cd /prod/backend && node node_modules/prisma/build/index.js generate

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /prod/backend ./
EXPOSE 3000
CMD ["node", "dist/main.js"]
