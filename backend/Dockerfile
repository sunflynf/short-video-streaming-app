# syntax=docker/dockerfile:1
# Build from the repository root: docker build -f backend/Dockerfile .
# (Railway does this via backend/railway.json.)

FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
# Manifests first so the dependency layer is cached between code changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
# Only so the lockfile matches the workspace; mobile dependencies aren't installed.
COPY apps/mobile/package.json apps/mobile/
# The backend's postinstall runs `prisma generate`, which needs the schema and config.
COPY backend/prisma backend/prisma
COPY backend/prisma.config.ts backend/
RUN pnpm install --frozen-lockfile --filter backend...
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY backend backend
RUN pnpm --filter @app/shared build \
 && pnpm --filter backend build \
 && pnpm --filter backend deploy --prod --legacy /app

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/v1/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist/main.js"]
