# Phase 6 — Testing, Hardening & Polish (Days 46–52)

**Status:** ✅ done for everything verifiable without a device. ⏳ The Phase 5 device QA checklist and real Sentry/EAS accounts are still pending. See [`docs/security.md`](../security.md) for the authorization table and the audit.

## Goal
Make the core flows reliable and observable, and block the obvious abuse vectors before real users arrive.

## Scope
- **In:** rate limiting, input sanitization review, error handling and logging, Sentry, test coverage for the core flows, performance checks.
- **Out:** load testing at scale, a full moderation tool (Phase 7 adds only a hook).

## Prerequisites
- Phases 1–5 feature-complete.

## Tasks

### Day 46 — Rate limiting & abuse
- [x] `@nestjs/throttler` with Redis storage: a small custom store (`src/throttling/redis-throttler.storage.ts`, one Lua script), because `@nest-lab/throttler-storage-redis` doesn't support Nest 12. Global default 100 req/min per user (signed in) or per IP.
- [x] Stricter route limits: `/auth/login` 5/min per IP+email, `/auth/signup` 3/min per IP, `/videos/upload` 10/hour, comments 10/min, follows 30/min (comments and follows were moved here from Phase 4), plus likes, views and shares (60/min)
- [x] Set `trust proxy` correctly (`TRUST_PROXY` = hops; 1 on Railway) so the IP is read from `X-Forwarded-For` behind Railway
- [x] Return 429 with a `Retry-After` header; the mobile client shows a friendly alert (at most one every 10 s)

### Day 47 — Validation & security review
- [x] Audit every DTO: max lengths, enums, no unvalidated `any` (see `docs/security.md`). Path IDs deliberately aren't format-checked: queries are parameterized and an unknown ID returns 404.
- [x] Check authorization on each mutating route (owner, admin): the table is in `docs/security.md`
- [x] `helmet`, a strict CORS allowlist in production (`CORS_ORIGINS`), JSON body limit 100 kB (Mux webhooks are a few kB, so they share the limit). Oversized bodies now return 413 instead of 500.
- [x] Make sure no secrets or tokens are logged: headers and bodies are never logged, auth headers are also redacted, and query strings are stripped
- [x] `pnpm audit`: the backend has none. Three findings in Expo build tooling have no patched release and aren't shipped; they're accepted and documented.

### Day 48 — Errors & observability
- [x] `nestjs-pino` structured logs carrying `requestId` and `userId` (pretty in development, JSON otherwise)
- [x] `@sentry/nestjs` with release = `SENTRY_RELEASE` or Railway's git SHA, plus an environment tag. Unexpected 5xx errors (tagged with `requestId` and the user ID) and jobs failing their last retry go to Sentry. IPs are stripped. `POST /admin/sentry-test` checks the wiring after a deploy.
- [x] `@sentry/react-native` in the mobile app (initialized only when `EXPO_PUBLIC_SENTRY_DSN` is set), with the Expo plugin and Metro debug IDs. ⏳ Source-map upload needs `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` as EAS secrets (Phase 7).
- [x] BullMQ: retries with exponential backoff (5 attempts); failed attempts are logged and final failures go to Sentry. `GET /admin/queues` (admin-only) returns JSON counts and recent failures per queue, instead of the Bull Board UI.
- [x] Extend `/health` with a queue depth check (`queues.<name>.waiting/active/delayed/failed`)

### Days 49–50 — Test coverage
- [x] E2E suites (Vitest + supertest, real Postgres + Redis in CI, provider mocked) covering the **golden path** (`test/golden-path.e2e-spec.ts`): signup → upload (simulated webhooks) → READY → appears in another user's feed → like → comment → notification → follow → Following feed
- [x] Concurrency tests: parallel like/unlike and follow/unfollow keep the counts consistent (added in Phases 1 and 3)
- [x] Coverage target: ≥ 70% lines on the services. Measured at **97% lines** across all services, processors and providers (`pnpm --filter backend test:cov`, enforced in CI).
- [x] Mobile: unit tests for `api.ts` and auth, plus the 13-step Playwright web smoke (Phase 5) instead of Maestro

### Day 51 — Performance
- [x] Seed 10k users, 50k videos and 500k likes (`backend/scripts/perf-seed.sql`), then `EXPLAIN ANALYZE` the feed, profile videos, comments and notifications queries. All are p95 < 100 ms, and all use indexes except the For You ranking (see *Performance*).
- [x] Add a Prisma query logging threshold (`SLOW_QUERY_MS`, default 200; log lines carry the request ID)
- [ ] Mobile: use the profiler to check feed re-renders. `VideoItem` is memoized and the viewability callback is stable; ⏳ profiling needs a device.

### Day 52 — Bug bash
- [ ] Go through the manual QA checklist from Phase 5 on both platforms. ⏳ **Needs devices.**
- [x] Triage everything into fix now or post-launch: two bugs found and fixed this phase (413 returned as 500; signed-out `/` route, Phase 5), the rest is listed in `docs/security.md` → Known gaps

## Contracts
**New env vars**
```dotenv
SENTRY_DSN=                # optional; SENTRY_RELEASE defaults to RAILWAY_GIT_COMMIT_SHA
SENTRY_RELEASE=
CORS_ORIGINS=https://example.com
THROTTLE_ENABLED=true
THROTTLE_DEFAULT_PER_MIN=100
TRUST_PROXY=0              # 1 on Railway
LOG_LEVEL=info
SLOW_QUERY_MS=200
# mobile
EXPO_PUBLIC_SENTRY_DSN=
```

## Done when
- [x] CI runs the golden-path e2e test (`pnpm test:cov` step). ⏳ CI itself only runs on PRs or `main`, so it hasn't run yet.
- [x] A deliberately thrown error shows up in Sentry with the request ID and release. Verified against a local Sentry ingest stub; ⏳ repeat with the real DSN after deploy (`POST /admin/sentry-test`).
- [x] Login brute-force (6 rapid attempts) is throttled (`test/throttles.e2e-spec.ts`)
- [x] No query in the core flows is p95 > 100 ms on the seeded dataset (worst: 40 ms)
- [ ] Zero known crash bugs on iOS and Android. ⏳ Needs device QA; there are no known crashes on web, and both native bundles build.

## Performance (10k users, 50k videos, 500k likes, 100k follows, 150k comments, 200k notifications)
Compiled API, local Postgres 16, 50 requests each, signed in as the heaviest users (pu1: 649 followers and 1,385 notifications; pv1: 3,235 comments):

| Endpoint | p50 | p95 |
|---|---|---|
| For You, new snapshot each time | 34 ms | 40 ms |
| For You, next page | 9 ms | 10 ms |
| Following | 9 ms | 11 ms |
| Profile / profile videos / followers | 5–7 ms | 7–9 ms |
| Comments (3k on the video) | 6 ms | 7 ms |
| Notifications / unread count | 6 ms | 7–9 ms |
| Liked videos | 9 ms | 12 ms |
| Like | 7 ms | 14 ms |

No query crossed a 50 ms slow-query threshold. `EXPLAIN ANALYZE`:
- **Index scans:** notifications (`recipientId, createdAt`, 0.2 ms), unread count (3 ms), comments (`videoId, createdAt`, 0.1 ms), liked list (`Like_pkey`, 0.3 ms), Following (`status, publishedAt`).
- **The exception is the For You ranking:** a parallel seq scan plus a top-N sort over about 11k in-window videos, 32 ms. That's inherent to scoring every candidate. At around 100k+ in-window videos, precompute scores (a scheduled job or a generated column) rather than adding indexes.

## Implementation notes (where the build differs from the original plan)
- **Redis throttler storage is our own** (about 50 lines plus a Lua script). The community store doesn't support Nest 12.
- **Throttle keys:**
  - Signed-in users are keyed by account, so a shared NAT doesn't share one budget.
  - Login is keyed by IP + email, so one attacker can't lock out a whole network.
  - Health checks and the Mux webhook are never throttled.
- **Throttling in tests:** e2e suites run with throttling off; `throttles.e2e-spec.ts` turns it on (env is validated when `app.module` is imported, so the spec sets it with `vi.hoisted`).
- **Queue admin is JSON**, not the Bull Board UI: there's no extra UI dependency, and it's easy to script.
- **Sentry is optional everywhere**: with no DSN, nothing is sent. It was verified end to end against a local ingest stub (the event carried the `requestId` tag, user ID, release and environment, with no IP). The same stub also caught a startup crash (`EADDRINUSE`), so boot failures are reported too.
- **Two bugs found and fixed:**
  - JSON bodies over 100 kB returned **500**. They now return 413 in the shared error shape.
  - Signed-out users hitting `/` got an unmatched route (Phase 5).

## Risks & notes
- Don't chase coverage numbers on controllers. Focus the tests on the services that hold the rules (counts, permissions, ranking, fan-out).
