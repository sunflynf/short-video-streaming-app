# Phase 3 — Feed & Discovery (Days 21–28)

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
- Fallback: if For You has fewer than `limit` items, fill the rest from older READY videos by `publishedAt desc`.
- Seen-filtering: skip videos the viewer has seen in the last 24 h. Store the seen IDs in a Redis set `seen:<userId>` with a 24 h TTL, filled by the view endpoint.

## Tasks

### Days 21–22 — Feed service
- [ ] `feed/feed.module.ts`, `feed.service.ts`, `feed.controller.ts`
- [ ] Compute the score in SQL with `$queryRaw` (Prisma can't order by an expression)
- [ ] **Cursor:** the score changes over time, so a score+id cursor is unstable. Use a **snapshot** instead: the first page builds a ranked ID list of up to 200 items, caches it in Redis `feed:<userId>:<snapshotId>` (TTL 30 min), and the cursor is `<snapshotId>:<offset>`. When the snapshot runs out, build a new one, excluding seen IDs.
- [ ] `GET /videos/feed?tab=foryou|following&cursor&limit` returns `Paginated<VideoDto>`. Anonymous users get For You without personalization.
- [ ] Batch-hydrate `likedByMe` with one `findMany` over the page's IDs (no N+1)

### Days 23–24 — Likes module
- [ ] `likes/likes.module.ts`, `likes.service.ts`, `likes.controller.ts`
- [ ] `POST /videos/:id/like` / `DELETE /videos/:id/like`: idempotent. Create or delete the `Like` row and `increment`/`decrement` `likeCount` in a single `$transaction`. Return `{ liked, likeCount }`.
- [ ] Only allowed on READY, non-hidden videos (404 otherwise)
- [ ] Emit a `like.created` event (`{ actorId, videoId, authorId }`) for Phase 4
- [ ] `GET /users/:id/liked` (paginated; only the user themself can see it in the MVP)

### Day 25 — Views
- [ ] `POST /videos/:id/view` with body `{ watchedMs }`: counts as a view only if `watchedMs >= min(3000, duration*1000*0.5)`. Debounce per user and video with Redis `SETNX view:<u>:<v>` (TTL 1 h). Increment `viewCount` and add the ID to `seen:<userId>`.
- [ ] Anonymous views are counted per IP hash with the same debounce

### Days 26–27 — Profile feed & caching
- [ ] `GET /users/:id/videos` already exists; make sure it returns the same `VideoDto` shape and hydrates `likedByMe`
- [ ] Short Redis cache (60 s) for the anonymous For You first page
- [ ] `EXPLAIN ANALYZE` the feed query with 10k seeded videos. Add or adjust indexes as needed (`@@index([status, hidden, publishedAt])`).

### Day 28 — Buffer
- [ ] Seed script `--videos 10000` option for load checks
- [ ] Update contracts if they changed

## Contracts

| Method | Path | Auth | Body / Query | Response |
|---|---|---|---|---|
| GET | `/videos/feed` | optional | `tab, cursor, limit` | `Paginated<VideoDto>` |
| POST | `/videos/:id/like` | user | — | `{ liked: true, likeCount }` |
| DELETE | `/videos/:id/like` | user | — | `{ liked: false, likeCount }` |
| POST | `/videos/:id/view` | optional | `{ watchedMs }` | 204 |
| GET | `/users/:id/liked` | self | `cursor, limit` | `Paginated<VideoDto>` |

**New env vars**
```dotenv
FEED_SNAPSHOT_SIZE=200
FEED_WINDOW_DAYS=14
```

## Done when
- [ ] Scrolling 50+ items in For You never returns duplicates within a session
- [ ] The Following tab shows only followed creators, newest first
- [ ] Rapid like/unlike calls (10 in parallel) leave `likeCount` equal to the number of `Like` rows
- [ ] Feed p95 < 150 ms locally with 10k videos (first page, warm DB)

## Tests
- Unit: score ordering on fixed fixtures; snapshot cursor paging (no duplicates or gaps); view threshold logic.
- E2E: like idempotency and count consistency; Following tab filters; hidden and non-READY videos never appear.

## Risks & notes
- The snapshot approach trades some freshness for stable paging, which suits the MVP. Revisit it if snapshots go stale for heavy users.
- A hot video can cause row contention on `likeCount`. If that shows up, move counts to Redis `INCR` with periodic flush. This isn't needed for the MVP.
