# Phase 3 — Feed & Discovery (Days 21–28)

**Status:** ✅ done (see *Implementation notes* for where the build differs from the original plan)

## Goal
The mobile client gets a fast, infinite, ranked feed of READY videos. Users can like and unlike, and profile feeds show a creator's videos.

## Scope
- **In:** the `feed` and `likes` modules, the ranking function, cursor pagination, a "following" feed, view counting.
- **Out:** ML recommendations, search and hashtags (post-MVP, TIMELINE Phase 8), the real-time socket push of like counts.

## Prerequisites
- Phase 2 done, with at least about 30 seeded READY videos across 5+ users.

## Ranking (v1: deterministic and explainable)
```text
score = (likeCount * 2 + commentCount * 3 + shareCount * 4 + 1)
        / pow(hoursSincePublished + 2, 1.5)
```
- The **For You** feed is READY, not hidden, published within the last 14 days, not authored by the viewer, and ordered by `score desc, id desc`.
- The **Following** feed has the same filters, limited to authors the viewer follows, and is ordered by `publishedAt desc`.
- Fallback: if the 14-day window has fewer than `FEED_SNAPSHOT_SIZE` videos, fill the snapshot with older READY videos by `publishedAt desc`.
- Seen-filtering: skip videos the viewer has seen in the last 24 h. Seen IDs live in a Redis sorted set `seen:<userId>` scored by view time, so each entry ages out after 24 h. The view endpoint fills it.

## Tasks

### Days 21–22 — Feed service
- [x] `feed/feed.module.ts`, `feed.service.ts`, `feed.controller.ts`
- [x] Compute the score in SQL with `$queryRaw` (Prisma can't order by an expression)
- [x] **Cursor:** the score changes over time, so a score+id cursor is unstable. Use a **snapshot** instead: the first page builds a ranked ID list of up to 200 items, caches it in Redis `feed:<userId>:<snapshotId>` (TTL 30 min), and the cursor is `<snapshotId>:<offset>`. When the snapshot runs out, the feed ends (`nextCursor: null`); a refresh with no cursor builds a new one that excludes seen IDs.
- [x] `GET /videos/feed?tab=foryou|following&cursor&limit` returns `Paginated<VideoDto>`. Anonymous users get For You without personalization.
- [x] Batch-hydrate `likedByMe` with one `findMany` over the page's IDs (no N+1)

### Days 23–24 — Likes module
- [x] `likes/likes.module.ts`, `likes.service.ts`, `likes.controller.ts`
- [x] `POST /videos/:id/like` / `DELETE /videos/:id/like`: idempotent. Create or delete the `Like` row and `increment`/`decrement` `likeCount` in a single `$transaction`. Return `{ liked, likeCount }`.
- [x] Only allowed on READY, non-hidden videos (404 otherwise)
- [x] Emit a `like.created` event (`{ actorId, videoId, authorId }`) for Phase 4
- [x] `GET /users/:id/liked` (paginated; only the user themself can see it in the MVP)

### Day 25 — Views
- [x] `POST /videos/:id/view` with body `{ watchedMs }`: counts as a view only if `watchedMs >= min(3000, duration*1000*0.5)`. Debounce per user and video with Redis `SETNX view:<u>:<v>` (TTL 1 h). Increment `viewCount` and add the ID to `seen:<userId>`.
- [x] Anonymous views are counted per IP hash with the same debounce

### Days 26–27 — Profile feed & caching
- [x] `GET /users/:id/videos` already exists; it returns the same `VideoDto` shape and now hydrates `likedByMe` (via `VideosService.toDtos`, as do `GET /videos/:id`, the feed and the liked list)
- [x] Short Redis cache (60 s) for the anonymous For You first page: anonymous viewers share one snapshot, which `feed:anon:current` points to for `ANON_FEED_CACHE_SEC`
- [x] `EXPLAIN ANALYZE` the feed query with 10k seeded videos. No new indexes were needed (results under *Performance*).

### Day 28 — Buffer
- [x] Seed script `--videos 10000` option for load checks (`pnpm --filter backend prisma:seed -- --videos 10000`; remove the rows with `DELETE FROM "Video" WHERE caption = 'load-test'`)
- [x] Update contracts if they changed

## Contracts

| Method | Path | Auth | Body / Query | Response |
|---|---|---|---|---|
| GET | `/videos/feed` | optional (`following` needs auth) | `tab=foryou\|following, cursor, limit` | `Paginated<VideoDto>`. For You cursors are `<snapshotId>:<offset>`; a malformed one returns 400, an expired one restarts the feed. Following cursors are the last video id. |
| POST | `/videos/:id/like` | user | — | `{ liked: true, likeCount }` |
| DELETE | `/videos/:id/like` | user | — | `{ liked: false, likeCount }` |
| POST | `/videos/:id/view` | optional | `{ watchedMs }` (integer, 0–3,600,000) | 204, counted only if `watchedMs >= min(3000, duration × 500)`, once per viewer per hour |
| GET | `/users/:id/liked` | self | `cursor, limit` | `Paginated<VideoDto>` (most recently liked first; cursor = last video id) |

Like and unlike return `LikeResponse = { liked, likeCount }` (in `@app/shared`). Liking returns 404 unless the video is READY and not hidden. Unliking works on any existing video.

**New env vars**
```dotenv
FEED_SNAPSHOT_SIZE=200
FEED_WINDOW_DAYS=14
FEED_SNAPSHOT_TTL_SEC=1800
ANON_FEED_CACHE_SEC=60
```

## Done when
- [x] Scrolling 50+ items in For You never returns duplicates within a session (60 items in pages of 10 in the e2e test)
- [x] The Following tab shows only followed creators, newest first
- [x] Rapid like/unlike calls leave `likeCount` equal to the number of `Like` rows (3 users × 10 parallel likes, then unlikes)
- [x] Feed p95 < 150 ms locally with 10k videos (first page, warm DB): 20 ms measured

## Tests
- Unit (`feed-ranking.spec.ts`): score ordering and weights, cursor round-trip and rejection of malformed cursors, view threshold boundaries.
- E2E:
  - `feed.e2e-spec.ts` (13 tests):
    - SQL order matches `feedScore`
    - exclusion and fill rules
    - 60-item scroll with no duplicates
    - stable paging while scores change
    - videos hidden mid-snapshot drop out
    - seen filtering
    - bad and expired cursors
    - per-viewer snapshot keys
    - anonymous cache
    - `likedByMe`
    - Following order, paging, 401 and tab validation
  - `likes.e2e-spec.ts` (5 tests):
    - idempotency and the event firing once
    - concurrency
    - 404 rules
    - `likedByMe` on profile lists
    - liked list privacy and paging
  - `views.e2e-spec.ts` (4 tests): debounce per user and per IP, thresholds, validation.

## Performance (10k READY videos, local Postgres 16)
| Query / request | Result |
|---|---|
| For You ranking SQL (`EXPLAIN ANALYZE`) | 6 ms. A seq scan plus top-N heapsort over about 3.6k in-window rows. It was 64 ms with Postgres `numeric` math, so the expression casts to `float8`. |
| Following SQL | 0.5 ms (backward scan on `Video(status, publishedAt)`, memoized `Follow` lookups) |
| `GET /videos/feed`, signed in, new snapshot every request | p50 14 ms / p95 20 ms |
| `GET /videos/feed`, next page from cached snapshot | p95 8 ms |
| `GET /videos/feed`, anonymous (shared cache) | p95 8 ms |
| `GET /videos/feed?tab=following` | p95 9 ms |

No new indexes. The planned `Video(status, hidden, publishedAt)` index wouldn't be used: the ranking query scans the in-window rows either way, and Following already uses `(status, publishedAt)`. Revisit at about 100k videos: index `publishedAt` for the window filter, or precompute scores.

## Implementation notes (where the build differs from the original plan)
- **The feed ends at the snapshot's end** instead of chaining a new snapshot. Chaining would need to exclude everything already served, while ending guarantees no duplicates. Pull-to-refresh starts a new, seen-filtered snapshot, and 200 items is about 20 pages.
- **Snapshot keys include the viewer** (`feed:u:<userId>:<id>` / `feed:anon:<id>`), so a cursor can't read someone else's snapshot. A foreign or expired cursor starts a fresh feed. Pages re-check visibility, so videos hidden or deleted after the snapshot drop out.
- **The seen set is a ZSET**, so each video ages out 24 h after it was watched, rather than the whole set expiring at once. Only qualified views count as seen.
- **Anonymous views** are debounced per SHA-256 of the IP; raw IPs aren't stored. Behind a proxy this needs `trust proxy` (Phase 6).
- **Views live in the feed module** (`ViewsService`), because they feed the seen set.
- **Route order:** `FeedModule` is imported before `VideosModule`, so `GET /videos/feed` wins over `GET /videos/:id`. A test covers it.
- **Test isolation:** e2e now uses Redis db 1 (`TEST_REDIS_URL` or `REDIS_URL` with `/1`). Before this, the e2e queue cleanup also wiped the dev `media` queue.

## Risks & notes
- The snapshot approach trades some freshness for stable paging, which suits the MVP. Revisit it if snapshots go stale for heavy users.
- A hot video can cause row contention on `likeCount`. If that shows up, move counts to Redis `INCR` with periodic flush. This isn't needed for the MVP.
