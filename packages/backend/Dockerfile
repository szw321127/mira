FROM node:22-slim AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.7.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/backend/package.json packages/backend/package.json

RUN pnpm install --frozen-lockfile --filter @rednote/backend...

COPY packages/backend packages/backend

RUN pnpm --filter @rednote/backend build

EXPOSE 3000

CMD ["pnpm", "--filter", "@rednote/backend", "start:prod"]
