# Production Performance Audit — ShortVid (Short-Video Streaming App)

You have access to this repository. Perform a **practical, evidence-based performance and scalability audit of the system as it exists today**. This is an audit and report only: **do not modify code**.

Do not give a generic checklist. Read the actual code, schema, and configuration, then say what is handled well, partially handled, missing, or likely to become a bottleneck in production.

The question to answer:

> **"If we deploy this to production and users, videos and engagement grow, where are the real bottlenecks and scalability risks, how serious are they, and what should we fix first?"**

---

## 0. System context (verify against the code; correct anything that is wrong)

This is **not** a multi-tenant system with an API gateway and microservices. It is a **single NestJS modular monolith** serving one mobile client. Audit what exists. Where a concept does not apply, say so in one line instead of inventing a finding.

| Layer | What exists (from README / `docs/decisions.md`) |
|---|---|
| Repo | pnpm monorepo: `apps/mobile`, `backend`, `packages/shared` (`@app/shared`) |
| Client | Expo + Expo Router, `expo-video` (HLS), Zustand (client state) + TanStack Query (server state). Also builds for web (`e2e/web-smoke.mjs`). |
| API | NestJS 12 (ESM, Express adapter), one process, global prefix `/v1`, Helmet, `ValidationPipe`, JWT (15 min access + rotating 30-day refresh, argon2) |
| DB | PostgreSQL 16 via Prisma 7 with the `@prisma/adapter-pg` driver adapter. Models: User, RefreshToken, Video, Like, Comment, Follow, Notification, Report, Block |
| Redis | Upstash in prod: BullMQ queues (`media`, `notifications`), throttler storage (custom, Lua), For You feed snapshots, "seen" sorted sets, view debounce keys |
| Media | **Mux** does upload, transcoding, HLS and thumbnails. Direct-to-Mux uploads; the API only handles the webhook (`mux-webhook.controller.ts`, `media.processor.ts`). R2 is used for avatars only (presigned PUT). |
| Hosting | Railway (API + Postgres, `backend/railway.json`, `preDeployCommand: prisma migrate deploy`), Upstash Redis, EAS Build/Update. Dockerfile: `node:22-slim`, non-root. Deploys via `.github/workflows/deploy.yml`. |
| Observability | Sentry (API + mobile), `nestjs-pino` JSON logs, `SLOW_QUERY_MS` slow-query logging in `prisma.service.ts`, request-id middleware, `/v1/health` |
| Existing perf evidence | `backend/scripts/perf-seed.sql` (10k users, 50k videos, 500k likes, 100k follows, 150k comments, 200k notifications) and the results table in `docs/plans/phase-6-hardening.md`. Treat these as claims to check, not facts. |

**Mapping of the generic concerns to this project:**

- "API Gateway / microservices / service-to-service" → the real external hops are **mobile → Railway edge → NestJS → {Postgres, Redis, Mux API, R2, Sentry}** and **Mux → webhook → BullMQ → worker**. Audit those hops and the module-to-module calls inside the monolith (for example `FeedService` → `BlocksService`, `VideosService.toDtos`, `SeenStore`).
- "Multi-tenant" → there are no tenants. Replace it with **per-user and per-creator fairness**: hot videos, creators with huge follower counts (notification fan-out), a single abusive user, anonymous traffic sharing one IP or one feed snapshot, and the rate-limit key design.
- "CDN" → video segments and thumbnails are served by Mux's CDN, avatars by R2 (`R2_PUBLIC_URL`). The API itself is not CDN-fronted. Audit whether that is a problem, for example for the share landing page `/v/:id`, or for anonymous `GET /v1/feed`.
- "Web frontend bundle / LCP / CLS" → the main client is **React Native**. Reframe as: cold start, time-to-first-frame of the first video, scroll and swipe smoothness (JS thread and UI thread), memory with many `expo-video` players, JS bundle size and Hermes, and battery and data use. Cover the web build only where it exists.

---

## 1. Areas to audit (project-specific focus)

For each area, read the files listed and report on the points named. Beyond these, follow whatever the code shows you.

### 1. Mobile client performance (`apps/mobile`)
- **Feed pager:** `src/components/FeedList.tsx`, `VideoItem.tsx`, `ActionRail.tsx`, `src/store/player.ts`. Check FlatList tuning (`windowSize`, `maxToRenderPerBatch`, `removeClippedSubviews`, `getItemLayout`, `pagingEnabled`), how many `expo-video` players are alive at once, whether off-screen players are released, whether preloading of neighbours is bounded, and whether `setActiveIndex` re-renders the whole list.
- **Render cost:** `memo` / `useCallback` use, props that change identity on every render, Zustand selectors that are too broad.
- **Server-state patterns:** TanStack Query config in `src/app/_layout.tsx` and `src/services/queries/*` (`staleTime`, `gcTime`, refetch-on-focus and refetch-on-reconnect, retry policy, `placeholderData`). Check `cache-updates.ts` and optimistic updates (like, follow, comment) for correctness and extra refetches.
- **Request patterns:** `src/services/api.ts` for the refresh-token flow (single-flight refresh, or a stampede of parallel 401s?), timeouts, `AbortSignal` / cancellation, retry and backoff, and duplicate or sequential requests on screen mount (`home`, `profile`, `video/[id]`, `comments/[videoId]`, `inbox`).
- **View tracking:** how and when `POST /feed/views` is sent (every swipe? batched? debounced?) and what happens offline.
- **Upload:** `upload-file.ts`, `validate-clip.ts`. Is the upload streamed from disk or read into memory? Is there resumability or progress? Is the clip validated before upload?
- **Media delivery:** thumbnail and poster usage, image sizing (`image.mux.com` params), avatar caching, `expo-image` or `Image`, and the adaptive-bitrate / startup behaviour of `expo-video` (buffer options, preload).
- **Lifecycle and leaks:** timers, listeners and subscriptions not cleaned up; `use-app-active.ts`; Sentry / analytics overhead on the hot path; token storage reads (`token-storage.ts`) on every request.
- **Bundle:** `package.json` dependencies, unused libraries, Hermes, and whether `metro.config.js` and `eas.json` enable minification and tree shaking.

### 2. Network and API (`backend/src`, `packages/shared`)
- **Compression:** `setup-app.ts` shows Helmet, CORS, body-parser and the validation pipe but **no `compression` middleware**. Confirm whether Railway's edge compresses JSON. If not, quantify the savings on a 10-20 item feed page.
- **Payload size:** `VideoDto` / `videoSelect` in `videos/video-mapper.ts` and `@app/shared/api/*`. Are fields over-fetched (full author object per item, counts, URLs)? Estimate bytes per feed page.
- **Pagination:** cursor design for every list endpoint (feed, following, profile videos, comments and replies, followers, notifications, liked videos, admin and moderation lists). Check `common/pagination.ts` (`toPage`) and the `limit` max. Identify any unbounded list.
- **Timeouts and retries:** is there any server-side request timeout? Client timeouts? Outbound timeouts and retry on the Mux and R2 calls (`mux.provider.ts`, `avatars.service.ts`)? Retry amplification between the client and BullMQ retries?
- **Rate limiting:** `throttling/*` (`limits.ts`, `app-throttler.guard.ts`, `redis-throttler.storage.ts`). Check the key design (account vs IP), what happens when Redis is slow or down (fail-open or fail-closed? `maxRetriesPerRequest: 1`), per-request Redis round trips, and whether the limits are sane for a swiping client (`engagement` 60/min, default 100/min versus view pings and feed paging).
- **HTTP/2, keep-alive:** what Railway terminates, and Node's `keepAliveTimeout` versus the proxy's idle timeout (the 502-under-load classic). Check `app.listen` settings.
- **Auth overhead:** `jwt.strategy.ts`, `banned.guard.ts`, `app-throttler.guard.ts`. Does each request do a DB or Redis lookup (ban check, user load) on top of JWT verification? Count the round trips per authenticated request.
- **Long-running or sync work in request paths:** account deletion (`account.service.ts`), report handling, the share page, anything that does multi-step work inline.
- **Likely hot endpoints to rank:** `GET /feed` (for-you and following), `POST /feed/views`, `POST /videos/:id/like`, `GET /videos/:id/comments`, `GET /notifications` + unread count (polled?), `POST /uploads`, `POST /media/mux-webhook`, `GET /v/:id`, `POST /auth/refresh`, `POST /auth/login` (argon2 is CPU-bound).

### 3. Backend runtime and concurrency
- **CPU-bound work on the event loop:** argon2 (check whether it runs on the libuv threadpool and the `UV_THREADPOOL_SIZE` impact), `JSON.parse` of 200-id snapshots, per-request mapping, `feedScore` in JS.
- **Single process:** is the API one Node process per instance? Any clustering? What happens to the event loop under a login burst?
- **Prisma and pg pool:** `PrismaPg({ connectionString })` is created **with no explicit pool settings** (`max`, `idleTimeoutMillis`, `connectionTimeoutMillis`). Establish the effective default pool size, compare it with the managed Postgres connection limit and the number of API replicas, and check whether the API and the BullMQ workers share the same pool.
- **Transactions:** `$transaction` usage in likes, follows, comments, account deletion and report handling. Check transaction length, any external call inside a transaction, and the lock order.
- **Counter writes:** `viewCount`, `likeCount`, `commentCount` and `shareCount` are denormalised columns updated with `increment`. Check for row-lock contention on a viral video (every like and every view is a write to the same `Video` row) and for write amplification.
- **BullMQ:** `common/queues.ts`, `media.queue.ts`, `media.processor.ts`, `notifications.processor.ts`, `observability/job-failures.ts`. Check concurrency, attempts and backoff, `removeOnComplete` / `removeOnFail` (Upstash memory and command cost), job payload size, dead-letter handling, and whether the worker runs in the API process (and so competes with request handling).
- **Notification fan-out:** `notifications.listener.ts`, `plan-notifications.ts`. What happens when a creator with N followers publishes a video? Is the fan-out O(N) in one job, batched, or bounded? Likes and comments on a hot video should not create unbounded notification rows.
- **Graceful shutdown:** `enableShutdownHooks`, in-flight requests, and queue draining on Railway deploys.
- **Memory:** unbounded in-memory structures, `rawBody: true` (it buffers every body), body limits, large `Map`/`Set` use, and any leak candidates.

### 4. Database (`backend/prisma/schema.prisma`, migrations, services)
Review every Prisma query and raw query against the existing indexes. Current indexes: `Video(authorId, publishedAt)`, `Video(status, publishedAt)`, `Like(userId, videoId)` PK + `Like(videoId)`, `Comment(videoId, createdAt)`, `Comment(parentId, createdAt)`, `Follow` PK + `(followingId, createdAt)` + `(followerId, createdAt)`, `Notification(recipientId, createdAt)`, `Report` indexes, `Block` PK + `(blockedId)`, `RefreshToken(userId)`.

Specific checks:
- **For You ranking** (`feed.service.ts: rankedIds`): scores every in-window `READY` video with a seq scan and a top-N sort per snapshot build. The docs claim 32-34 ms at ~11k in-window videos and say to precompute at 100k+. Verify the plan with `EXPLAIN (ANALYZE, BUFFERS)`, model how cost grows with the number of videos in `FEED_WINDOW_DAYS` (14 days) and with concurrent refreshes, and say when it becomes a problem. `NOT (id = ANY(excluded))` and `NOT ("authorId" = ANY(hiddenAuthors))` are passed as arrays; check their size limits.
- **Per-request fixed costs in `FeedService.forYou`:** `blocks.hiddenUserIds(viewer)` is called on every page and on every snapshot; `seen.list` reads the whole 24 h sorted set; `videos.toDtos` runs 2 extra queries per page. Count the DB and Redis round trips per feed page and per refresh.
- **Following feed:** `author: { followers: { some: ... } }` is a semi-join. Check the plan for a user who follows many creators. Check the `Prisma cursor + skip:1` pattern against a `(publishedAt desc, id desc)` order, and whether it uses the composite index efficiently.
- **Fallback "older videos" query in `createSnapshot`:** `id NOT IN excluded` plus `authorId NOT IN ...` over the whole history. Check the plan.
- **Missing index candidates (justify each by a concrete query or drop it):** `Video(hidden)` / partial index on `READY AND NOT hidden`, `Notification(recipientId, readAt)` for the unread count, `Comment` for a user's comments (account deletion), `Like(userId, createdAt)` for "liked videos" ordering, `Video` ranking columns, `Report` lookups. Also list **redundant indexes** (for example `Video(status, publishedAt)` versus the partial index you might need, `Like(videoId)` versus its use, `Follow(followerId, createdAt)` versus the PK).
- **Hot-row contention:** the counter updates above, plus `Notification` writes on likes.
- **Offset pagination:** the For You feed uses an in-Redis offset (fine); check that no endpoint uses `skip` with large values.
- **Account deletion** (`account.service.ts`): cascades across Like, Comment, Follow, Notification, Report and Block for a heavy user. Is it one transaction, and how long can it lock rows?
- **Moderation and admin queries:** `moderation.controller.ts`, `reports.service.ts`, `admin.controller.ts` for unbounded or unindexed scans.
- **Search and trending:** the README lists them as MVP features. State whether they exist; if not, say so and note what query pattern they will need (do not recommend building them).
- **Migrations:** `prisma migrate deploy` in `preDeployCommand`; check the locking risk of future index creation (`CREATE INDEX` without `CONCURRENTLY`).
- **Data growth:** estimate the row growth and size of `Notification`, `Like`, `Comment` and `RefreshToken` (expired tokens: is there cleanup?) over 6 and 12 months at plausible DAU. Say what needs retention or archival.

### 5. Caching (Redis and HTTP)
- **Feed snapshots:** the key is `feed:u:{viewerId}:{snapshotId}` with a 1800 s TTL and 200 ids (about 5-6 KB) per refresh. Estimate Upstash memory and command cost at N DAU, and check what happens when users pull-to-refresh repeatedly (is there a cap on live snapshots per user?). Check the **anonymous shared snapshot** (`feed:anon:current`, 60 s TTL) for a cache stampede: when it expires, N concurrent requests each run the ranking query.
- **Seen sets:** `seen:{userId}` is capped by time (24 h) but not by size; `zrangebyscore` returns the entire set on every refresh. Check the worst case for a heavy viewer.
- **View debounce keys:** `view:{viewerKey}:{videoId}` with a 1 h TTL, one key per viewer per video. Check the key cardinality and memory, and the key design for anonymous users (`common/viewer-key.ts`: IP-based, so shared NAT collapses many viewers into one).
- **Correctness of snapshot caching:** videos hidden, deleted or blocked after the snapshot was taken are re-filtered on read (good if so). Check that `toDtos` counters (likes, comments) are read fresh, not cached.
- **HTTP caching:** are `Cache-Control` / `ETag` headers set anywhere (`/v/:id` share page, legal pages, public profile or video GETs)? Which responses may be cached publicly (anonymous feed, legal pages, share page) and which must never be (anything with `likedByMe`, `followingAuthor`, notifications, tokens)? Check that Express's default weak ETag is not causing useless work.
- **Candidates that should probably be cached** (justify each by cost versus staleness): `blocks.hiddenUserIds` for the viewer (per request today), public video and profile reads, the share page, `Cache-Control` on legal pages.
- **Things that should NOT be cached:** auth/token endpoints, per-viewer flags, unread counts, anything that depends on moderation state without a short TTL.
- **Redis as a single dependency:** the throttler, queues, feed and seen sets all share one Upstash instance. Check what fails when Redis is slow (`maxRetriesPerRequest: 1`, no command timeout configured), and whether the feed falls back to Postgres.
- **Upstash specifics:** per-command pricing, the max request size, the command rate of BullMQ polling (idle polling cost), and the connection limit.

### 6. Fairness and abuse (replaces "multi-tenant")
- **Hot content:** a viral video means a burst of likes, comments, view pings and notifications on one row.
- **Big creators:** follower fan-out on publish (see Backend). `Follow(followingId, createdAt)` scans for a creator with millions of followers.
- **Per-user limits:** the throttle key design, with signed-in users keyed by account and anonymous users keyed by IP. Check for IP-spoofing risks under `TRUST_PROXY=1` and the effect of shared NATs / mobile carrier CGNAT on anonymous limits.
- **Quotas:** `MAX_ACTIVE_UPLOADS`, `MAX_DAILY_UPLOADS`, the comment length cap (`comment-body.ts`), and the body-size limit. Is there a cost-control path for Mux (every upload costs money in encoding, storage and delivery)?
- **Isolation of workloads:** can a notification fan-out spike or a Mux webhook storm starve user-facing requests (same process, same pool, same Redis)?

### 7. External dependencies and request flows (replaces "API gateway / microservices")
- **Mux:** the upload creation call (`mux.provider.ts`) is in the request path. Timeout? Failure behaviour? Webhook processing is async via BullMQ (good if confirmed); check idempotency, ordering, and the status transitions `UPLOADING → PROCESSING → READY`.
- **R2 / avatars:** presigned PUT (no server bandwidth, if confirmed).
- **Sentry:** sampling rates (`instrument.ts`, `lib/sentry.ts`); performance tracing can add real overhead if `tracesSampleRate` is high.
- **Cascading failure:** list what happens to each critical flow if Redis, Postgres, or Mux is slow or down.
- **Single points of failure:** one API instance, one Postgres, one Redis.

### 8. Infrastructure and deployment
- **Railway:** `railway.json` (health check, restart policy). Resource limits, replicas, region co-location of the API, Postgres and Upstash (cross-region latency on every Redis call is a major hidden cost), and whether the Postgres plan's connection limit and storage are adequate.
- **Docker:** `backend/Dockerfile` (multi-stage, prod-only deps, non-root, HEALTHCHECK are fine if confirmed). Check Node memory flags (`--max-old-space-size` versus the container limit), cold-start time, and image size.
- **Deploy safety:** `preDeployCommand: prisma migrate deploy`, zero-downtime behaviour, the health check timeout (60 s), and `/v1/health` (does it hit the DB and Redis? how expensive is it at the Docker `HEALTHCHECK` interval?).
- **Logging overhead:** pino at `info`, request logging volume, and the `SLOW_QUERY_MS` event handler (the `query` log event is enabled for all queries, so check the per-query overhead of emitting every query event).
- **CI:** `.github/workflows/ci.yml` (cache usage, e2e duration). Not a production concern, so be brief.
- **Do not assume** Kubernetes, autoscaling, read replicas, a message-queue upgrade, or a CDN in front of the API are needed. Recommend them only if the evidence forces it.

### 9. Observability
Check whether production can currently answer: p50/p95/p99 per route; slowest endpoint; slowest query; RPS; in-flight requests; error rate; event-loop lag; heap and RSS; Prisma/pg pool saturation; Redis latency; BullMQ queue depth, wait time and failure counts; Mux webhook lag (upload created → READY); per-user or per-creator load; and mobile-side metrics (time to first frame, rebuffer rate, crash-free rate, API latency as seen from the device).
Review what exists: `nestjs-pino`, `request-id.middleware.ts`, `SLOW_QUERY_MS`, Sentry (errors only, or tracing too?), `job-failures.ts`, `/v1/health`, the admin queue endpoint (`admin.controller.ts`), `lib/analytics.ts`. Note the **absence** of a metrics endpoint (Prometheus/OpenTelemetry) and dashboards or alerts if confirmed, and what the cheapest way to close each gap on Railway would be.

### 10. Load testing and capacity
- **What exists:** `perf-seed.sql` and the single-user 50-request timing table in `phase-6-hardening.md`. Judge whether this is a load test (it is serial and single-user, so it probably is not), what it does not cover (concurrency, writes, Redis, the pool, the webhook path, cold snapshots), and whether the numbers were measured on a local DB (no network latency to Postgres or Upstash).
- **Missing inputs:** expected DAU, peak concurrent viewers, videos per day, average views per session, and the read:write ratio. List the assumptions you used and mark them clearly as assumptions.
- **Propose a realistic k6 (or Artillery) plan** built from actual user journeys (see section 6 of the report). Seed data from `perf-seed.sql`, and run against a staging environment shaped like production, not localhost.

---

## 2. Classification, evidence and anti-premature-optimisation rules

Classify every significant finding as **GOOD**, **WARNING**, **PROBLEM**, **CRITICAL** or **UNKNOWN** (needs runtime measurement). Do not call something a problem without evidence.

For every finding give: **Area · Severity · Finding · Evidence (file:line, query, or config) · Potential impact · Recommended action · Priority (P0-P3) · How to verify** (a concrete `EXPLAIN ANALYZE`, `k6` scenario, `redis-cli` command, or profiler step).

- **P0** immediate production risk · **P1** will hurt as traffic or data grows · **P2** worth doing, not blocking · **P3** low-impact optimisation.
- Prefer high-impact, low-effort items. Do not produce a flat list of hundreds.
- Separate **measured/observed** problems from **theoretical** ones, and label the theoretical ones.
- Say plainly when something is done well. The project already shows good practice in several places (for example conditional updates for webhook idempotency, snapshot-based paging, `float8` ranking math, `videos.toDtos` batching instead of N+1, direct-to-Mux uploads, slow-query logging). Confirm or refute each from the code. Do not hunt for problems to fill the report.
- Do **not** recommend Redis (already used), Kubernetes, microservice splitting, sharding, read replicas, extra queues, a CDN in front of the API, or autoscaling unless the evidence requires it. Explain the evidence if you do.
- Do not recommend an index without naming the exact query it serves and its expected plan change. Mention write-cost trade-offs, since `Like`, `Notification` and `Video` are write-heavy.
- Consider reliability alongside speed (timeouts, backpressure, failure modes).

---

## 3. Final report structure

1. **Executive summary:** overall risk; biggest current bottlenecks; biggest future scalability risks; strong areas; the few most important actions.
2. **Scorecard** — rows: Mobile client, Network/API, Backend runtime, Database, Caching (Redis/HTTP), Fairness/abuse, External dependencies & flows, Infrastructure, Observability, Load testing. Columns: Area · Status (GOOD/WARNING/PROBLEM/CRITICAL/UNKNOWN) · Risk · Confidence (High/Medium/Low) · Main finding.
3. **Top 10 risks**, ranked: `#n — [P0-P3] Finding` with *Why it matters / Evidence / Impact / Recommendation / Verification*.
4. **Detailed findings** grouped by the ten areas above, using the evidence format.
5. **Performance-critical request flows**, traced hop by hop with the number of network hops, DB queries and Redis commands, latency contributors, bottlenecks, and missing measurements. At minimum:
   - Open app → `GET /v1/feed` (For You, signed in, **cold snapshot**) → first video playing.
   - Swipe → next page (`GET /v1/feed?cursor=`) + `POST /v1/feed/views`.
   - Like → `POST /v1/videos/:id/like` → counter update → notification event → BullMQ → notification row.
   - Upload → `POST /v1/uploads` → direct upload to Mux → Mux webhook → `media` queue → video `READY` → followers' notification fan-out.
   - Auth refresh under concurrent 401s; login (argon2).
   - Open comments → `GET /v1/videos/:id/comments`; post a comment.
   - Open a share link `GET /v/:id` (anonymous, public).
   Draw each as an ASCII diagram and mark where latency accumulates.
6. **Recommended metrics:** application (requests, p50/p95/p99, errors, in-flight, event-loop lag, heap/RSS); database (query latency, slow queries, pool utilisation, active connections, lock waits, table and index sizes); Redis/Upstash (latency, memory, commands per second, key counts by prefix: `feed:`, `seen:`, `view:`); BullMQ (depth, wait time, failures per queue); infrastructure (CPU, memory, restarts, network, region latency); product/fairness (requests per user, top creators by writes, most expensive endpoints, Mux webhook lag, time to first frame, rebuffer rate).
7. **Load-testing plan** with realistic journeys: *browse* (cold start → feed → 10-20 swipes with view pings), *engage* (like/comment/follow), *creator* (upload → webhook → publish → fan-out), *anonymous/share-link* traffic, *auth storm* (login/refresh). For each: virtual users, RPS targets, ramp-up, peak, a spike test (for example a viral video or a push-notification wave), a soak test (memory growth, Redis key growth, pool leaks), pass/fail criteria (for example p95 < 300 ms on feed, error rate < 0.5 %), and what to watch. Mux must be stubbed or replaced for load tests (reuse `backend/test/stub-mux.provider.ts`). State assumptions about DAU and peak concurrency.
8. **Action plan** in three phases — *Phase 1 immediate (before/right after launch)*, *Phase 2 short term (expected growth)*, *Phase 3 scalability (only when measurements justify it)* — each as a table: Priority · Action · Expected benefit · Effort · Risk · Dependency.

## 4. Ground rules

1. Inspect the actual code before concluding anything; cite `file:line`.
2. Run read-only checks where they help (for example start the local Postgres/Redis per the README, load `perf-seed.sql` into a scratch database, and run `EXPLAIN (ANALYZE, BUFFERS)` on the real queries; count Prisma queries per endpoint using the query log). Say what you ran and what you could not run. **Do not modify tracked code or commit.**
3. If a conclusion needs production traffic or a managed-service limit you cannot see (Railway plan, Upstash plan, Mux limits), mark it **UNKNOWN** and say which measurement settles it.
4. Explain *why* each issue becomes a bottleneck (the mechanism and the scale at which it bites), not merely that it "could be optimised".
5. Keep the report as short as the findings allow.
