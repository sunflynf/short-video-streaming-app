# Local Development

## Prerequisites

- Node.js 22 (`.nvmrc`)
- pnpm 10 (`corepack enable`)
- Docker (local PostgreSQL + Redis)

## Setup

```bash
git clone https://github.com/sunflynf/short-video-streaming-app.git
cd short-video-streaming-app

docker compose up -d                 # Postgres + Redis
pnpm install

cp backend/.env.example backend/.env
pnpm --filter backend exec prisma migrate dev
pnpm --filter backend prisma:seed    # 5 demo users, password "password123"

cp apps/mobile/.env.example apps/mobile/.env

pnpm dev                             # API + Expo together
curl http://localhost:3000/v1/health # API docs: http://localhost:3000/docs
```

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter backend test:e2e       # uses a separate <db>_test database and Redis db 1
pnpm --filter backend test:cov       # unit + e2e with the 70% service coverage gate (as CI runs it)
```

## Environment variables

See `backend/.env.example` and `apps/mobile/.env.example`; each phase plan lists the variables it adds. Notable ones:

- `MUX_*`: optional locally; without them the API runs but video uploads return 503. See *Run it against real Mux* in `docs/plans/phase-2-media.md`.
- Feed: `FEED_SNAPSHOT_SIZE`, `FEED_WINDOW_DAYS`, `FEED_SNAPSHOT_TTL_SEC`, `ANON_FEED_CACHE_SEC`.
- Production-only checks are described in [Launch Runbook](Launch-Runbook#2-secrets).

## Conventions

- Plans in `docs/plans/` use `- [ ]` task checkboxes; tick them in the PR that completes them. Update a plan's **Contracts** section in the same PR as any contract change.
- Never run `prisma:seed` in production.
