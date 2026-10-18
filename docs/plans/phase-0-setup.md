# Phase 0 — Planning & Setup (Days 1–3)

## Goal
Set up a monorepo where `pnpm dev` starts the API (with Postgres and Redis) and the Expo app, and CI runs lint, typecheck and tests on every push.

## Scope
- **In:** repo tooling, project skeletons, local infra, CI, env templates.
- **Out:** any feature code, the DB schema beyond a placeholder (Phase 1), and deployment (Phase 7).

## Prerequisites
- Node.js 20 LTS, pnpm 9, Docker, an Expo Go app or simulator.
- Accounts (free tiers are enough for now): GitHub, Mux, Expo. The Mux and Expo accounts are needed from Phase 2 and Phase 5.

## Tasks

### Day 1 — Workspace & tooling
- [ ] Root `package.json` (private), `pnpm-workspace.yaml` listing `apps/*`, `backend` and `packages/*`
- [ ] `.nvmrc` (20), `.editorconfig`, `.gitignore` (node_modules, dist, .env, .expo, coverage)
- [ ] Root `tsconfig.base.json` with strict mode enabled
- [ ] ESLint (flat config) + Prettier at the root, plus a `lint` / `format` / `typecheck` script in each package
- [ ] Root scripts: `dev`, `lint`, `typecheck`, `test`, which call `pnpm -r --parallel`
- [ ] Optional: Husky + lint-staged pre-commit hook running Prettier and ESLint on staged files

### Day 2 — Backend & shared skeleton
- [ ] `backend/`: Nest scaffold (`nest new backend --package-manager pnpm --skip-git`)
- [ ] Add `@nestjs/config` with Joi/Zod env validation in `backend/src/config/env.ts` so the app fails fast on missing vars
- [ ] `backend/src/prisma/prisma.module.ts` + `prisma.service.ts` (global module, `enableShutdownHooks`)
- [ ] `backend/prisma/schema.prisma` with only the datasource and generator; run the first empty migration
- [ ] `GET /health` returning `{ status: "ok", db: "ok", redis: "ok" }` (via `@nestjs/terminus`)
- [ ] Root `docker-compose.yml` with `postgres:16` (port 5432, volume) and `redis:7` (port 6379)
- [ ] `backend/.env.example` (see Contracts)
- [ ] `packages/shared/`: `package.json` (`"name": "@app/shared"`), `src/index.ts`, and the `tsc` build. Export a `Paginated<T>` type.

### Day 3 — Mobile skeleton & CI
- [ ] `apps/mobile/`: `create-expo-app` with the Expo Router + TypeScript template
- [ ] Configure Metro for the pnpm monorepo (`watchFolders`, `nodeModulesPaths`) so `@app/shared` resolves
- [ ] `apps/mobile/.env.example` with `EXPO_PUBLIC_API_URL`
- [ ] `apps/mobile/src/services/api.ts`: fetch wrapper that reads the base URL from env. The home screen calls `/health` and displays the result.
- [ ] `.github/workflows/ci.yml`: on push/PR, install with pnpm cache, then `lint`, `typecheck`, `test`. Start a Postgres service container for the backend tests.
- [ ] Update the root `README.md` *Getting Started* to match the real commands

## Contracts

**`backend/.env.example`**
```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://app:app@localhost:5432/app
REDIS_URL=redis://localhost:6379
```

**`apps/mobile/.env.example`**
```dotenv
EXPO_PUBLIC_API_URL=http://localhost:3000/v1
```

## Done when
- [ ] Starting from a fresh clone, `docker compose up -d && pnpm i && pnpm dev` starts the API and Metro without errors
- [ ] The Expo app on a simulator shows the `/health` response
- [ ] CI is green on the branch
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass locally

## Tests
- Backend: one e2e test for `GET /health` (Jest + supertest). This proves the test harness and the DB service work in CI.

## Risks & notes
- **Metro + pnpm symlinks** cause the most friction in Expo monorepos. If resolution keeps failing, set `node-linker=hoisted` in `.npmrc`.
- On a physical device, `localhost` means the phone itself. Use the machine's LAN IP or `npx expo start --tunnel`.
