FROM node:22-slim AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.7.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/web-frontend/package.json packages/web-frontend/package.json

RUN pnpm install --frozen-lockfile --filter @rednote/web-frontend...

COPY packages/web-frontend packages/web-frontend

RUN pnpm --filter @rednote/web-frontend build

EXPOSE 80

CMD ["pnpm", "--filter", "@rednote/web-frontend", "start", "--", "-p", "80"]
