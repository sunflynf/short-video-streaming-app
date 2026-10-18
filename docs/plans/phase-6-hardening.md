# Phase 6 — Testing, Hardening & Polish (Days 46–52)

## Goal
Make the core flows reliable and observable, and block the obvious abuse vectors before real users arrive.

## Scope
- **In:** rate limiting, input sanitization review, error handling and logging, Sentry, test coverage for the core flows, performance checks.
- **Out:** load testing at scale, a full moderation tool (Phase 7 adds only a hook).

## Prerequisites
- Phases 1–5 feature-complete.

## Tasks

### Day 46 — Rate limiting & abuse
- [ ] `@nestjs/throttler` with Redis storage (`@nest-lab/throttler-storage-redis`). Global default 100 req/min per user or IP.
- [ ] Stricter route limits: `/auth/login` 5/min per IP+email, `/auth/signup` 3/min per IP, `/videos/upload` 10/hour, comments 10/min, follows 30/min (comments and follows were moved here from Phase 4), plus likes, views and shares (60/min)
- [ ] Set `trust proxy` correctly so the IP is read from `X-Forwarded-For` behind Railway
- [ ] Return 429 with a `Retry-After` header; the mobile client shows a friendly toast

### Day 47 — Validation & security review
- [ ] Audit every DTO: max lengths, enums, `@IsCuid`-style ID checks, no unvalidated `any`
- [ ] Check authorization on each mutating route (owner, admin), with a table in the PR description
- [ ] `helmet`, a strict CORS allowlist in production, JSON body limit 100 kB (except the webhook)
- [ ] Make sure no secrets or tokens are logged (pino `redact` for `authorization`, `password`, `refreshToken`)
- [ ] `pnpm audit` and fix high/critical findings

### Day 48 — Errors & observability
- [ ] `nestjs-pino` structured logs carrying `requestId` and `userId`
- [ ] `@sentry/nestjs` with release = git SHA, environment tag. 5xx and unhandled job failures go to Sentry.
- [ ] `@sentry/react-native` in the mobile app, with source maps uploaded by EAS
- [ ] BullMQ: retries with exponential backoff (5 attempts); failed jobs are logged and sent to Sentry. Add a `GET /admin/queues` view (Bull Board, admin-only).
- [ ] Extend `/health` with a queue depth check

### Days 49–50 — Test coverage
- [ ] E2E suites (Vitest + supertest, real Postgres + Redis in CI, provider mocked) covering the **golden path**: signup → upload (simulated webhooks) → READY → appears in another user's feed → like → comment → notification → follow → Following feed
- [ ] Concurrency tests: parallel like/unlike and follow/unfollow keep the counts consistent
- [ ] Coverage target: ≥ 70% lines on `auth`, `feed`, `likes`, `comments`, `notifications`, `media` services
- [ ] Mobile: smoke test of the `api.ts` and auth flows; optionally a Maestro flow for login → feed → like

### Day 51 — Performance
- [ ] Seed 10k users, 50k videos and 500k likes, then `EXPLAIN ANALYZE` the feed, profile videos, comments and notifications queries. Every query uses an index and is p95 < 100 ms.
- [ ] Add a Prisma query logging threshold (warn when > 200 ms)
- [ ] Mobile: use the profiler to check feed re-renders (memoize `VideoItem`, stable callbacks)

### Day 52 — Bug bash
- [ ] Go through the manual QA checklist from Phase 5 on both platforms
- [ ] Triage everything into fix now or post-launch issues

## Contracts
**New env vars**
```dotenv
SENTRY_DSN=
CORS_ORIGINS=https://example.com
THROTTLE_DEFAULT_PER_MIN=100
```

## Done when
- [ ] CI runs the golden-path e2e test and it's green
- [ ] A deliberately thrown error shows up in Sentry with the request ID and release
- [ ] Login brute-force (6 rapid attempts) is throttled
- [ ] No query in the core flows is p95 > 100 ms on the seeded dataset
- [ ] Zero known crash bugs on iOS and Android

## Risks & notes
- Don't chase coverage numbers on controllers. Focus the tests on the services that hold the rules (counts, permissions, ranking, fan-out).
