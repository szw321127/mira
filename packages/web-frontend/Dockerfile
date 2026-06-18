FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/web-frontend/package.json packages/web-frontend/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY packages/web-frontend packages/web-frontend
RUN pnpm --filter @mira/web-frontend build
RUN pnpm --filter @mira/web-frontend deploy --legacy --prod /prod/web-frontend
RUN cp -R packages/web-frontend/.next /prod/web-frontend/.next

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /prod/web-frontend ./
EXPOSE 3000
CMD ["pnpm", "start"]
