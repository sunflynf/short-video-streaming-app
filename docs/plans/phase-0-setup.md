# Phase 0 — Planning & Setup (Days 1–3)

**Status:** ✅ done (see *Implementation notes* for where the build differs from the original plan)

## Goal
Set up a monorepo where `pnpm dev` starts the API (with Postgres and Redis) and the Expo app, and CI runs lint, typecheck and tests on every push.

## Scope
- **In:** repo tooling, project skeletons, local infra, CI, env templates.
- **Out:** any feature code, the DB schema beyond a placeholder (Phase 1), and deployment (Phase 7).

## Prerequisites
- Node.js 22 (`.nvmrc`), pnpm 10 (pinned via `packageManager`, use `corepack enable`), Docker, an Expo Go app or simulator.
- Accounts (free tiers are enough for now): GitHub, Mux, Expo. The Mux and Expo accounts are needed from Phase 2 and Phase 5.

## Tasks

### Day 1 — Workspace & tooling
- [x] Root `package.json` (private), `pnpm-workspace.yaml` listing `apps/*`, `backend` and `packages/*`
- [x] `.nvmrc` (22), `.editorconfig`, `.gitignore` (node_modules, dist, .env, .expo, coverage, generated Prisma client)
- [x] Root `tsconfig.base.json` with strict mode enabled
- [x] ESLint (flat config) + Prettier at the root, plus a `lint` / `typecheck` / `test` script in each package
- [x] Root scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `format`, `format:check`
- [ ] Optional: Husky + lint-staged pre-commit hook (skipped; CI runs `format:check`)

### Day 2 — Backend & shared skeleton
- [x] `backend/`: NestJS 12 app, written by hand to match the Nest 12 ESM starter (ESM package, Vitest)
- [x] `@nestjs/config` with Zod env validation in `backend/src/config/env.ts`, so the app fails fast on missing vars
- [x] `backend/src/prisma/prisma.module.ts` + `prisma.service.ts` (global module, Prisma 7 with the `@prisma/adapter-pg` driver adapter)
- [x] `backend/prisma/schema.prisma` with only the datasource and generator, plus `backend/prisma.config.ts`
- [x] `GET /v1/health` returning `{ status, db, redis }` (200 when both are up, 503 otherwise)
- [x] Root `docker-compose.yml` with `postgres:16` (port 5432, volume) and `redis:7` (port 6379)
- [x] `backend/.env.example` (see Contracts)
- [x] `packages/shared/` (`@app/shared`): `Paginated<T>`, `ApiError`, `HealthResponse`, built with `tsc`

### Day 3 — Mobile skeleton & CI
- [x] `apps/mobile/`: `create-expo-app` (SDK 58, Expo Router), stripped down to a single screen
- [x] `@app/shared` resolves through Metro with no custom `metro.config.js`, because Expo configures monorepos automatically
- [x] `apps/mobile/.env.example` with `EXPO_PUBLIC_API_URL`
- [x] `apps/mobile/src/services/api.ts`: typed fetch wrapper. The home screen calls `/health` and shows the result, with a retry button.
- [x] `.github/workflows/ci.yml`: pnpm install, `format:check`, `lint`, `typecheck`, `test`, then the backend e2e test against Postgres + Redis service containers
- [x] Root `README.md` *Getting Started* updated to the real commands

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

**`GET /v1/health`** returns `HealthResponse` from `@app/shared`:
```json
{ "status": "ok", "db": "ok", "redis": "ok" }
```

## Done when
- [x] From a fresh clone, `docker compose up -d && pnpm i && pnpm dev` starts the API and Metro. Verified with local Postgres 16 and Redis; Docker itself wasn't available in the build environment.
- [ ] The Expo app on a simulator shows the `/health` response. `expo export --platform ios` bundles successfully, but this still needs a check on a device or simulator.
- [ ] CI is green on the branch (it runs on the first push to `main` or the first PR)
- [x] `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` pass locally

## Tests
- Backend unit test (Vitest): `src/config/env.spec.ts` covers env defaults and the missing-var error.
- Backend e2e test (Vitest + supertest, `pnpm --filter backend test:e2e`): `test/health.e2e-spec.ts` boots the full app against real Postgres and Redis.
- Mobile (jest-expo): `src/services/api.test.ts` covers parsing a successful response and the error path.

## Implementation notes (where the build differs from the original plan)
- **NestJS 12 is ESM-only**, so the backend is an ESM package (`"type": "module"`, relative imports end in `.js`). Jest can't load ESM on Node 22, so backend tests use **Vitest**, as in the Nest 12 ESM starter. Use `describe`/`it`/`vi` globals in later phases.
- **Prisma 7** keeps the DB URL in `backend/prisma.config.ts` instead of the schema. It needs a driver adapter (`@prisma/adapter-pg`) and generates the client into `backend/src/generated/prisma` (gitignored; `postinstall` runs `prisma generate`). Import it from `../generated/prisma/client.js`. `prisma@latest` is currently an 8.0 RC, so 7.10.1 is pinned.
- **TypeScript ~6.0**: TS 7 is out, but `typescript-eslint` doesn't support it yet.
- **ESLint**: the root (backend, shared) uses ESLint 10. The mobile app stays on ESLint 9 because `eslint-config-expo`'s React plugin crashes on 10. `expo lint` uses `apps/mobile/eslint.config.js`.
- **Health check** is a small controller rather than `@nestjs/terminus`. It's two pings, and returns the shared `HealthResponse` shape.
- **No empty migration**: Prisma doesn't create one for a schema with no models. Phase 1's `init` migration is the first.
- **Global prefix `v1`** is set in `backend/src/setup-app.ts`, which `main.ts` and the e2e tests share, so Phase 1 only needs to add the validation pipe and error filter there.

## Risks & notes
- On a physical device, `localhost` means the phone itself. Set `EXPO_PUBLIC_API_URL` to the machine's LAN IP, or use `npx expo start --tunnel`.
- Add native mobile dependencies with `npx expo install <pkg>` so versions match the SDK.
