# Architecture

## Monorepo (pnpm workspaces)

```text
apps/mobile          Expo (React Native) app, Expo Router
apps/web-admin       (post-MVP) Next.js admin / creator dashboard
backend              NestJS API (ESM, Express adapter)
packages/shared      @app/shared: API DTO types and constants used by backend and mobile
docs/                Decisions, per-phase plans, security review, launch runbook
```

Mobile and the API share types through `packages/shared`, so a contract change breaks the build instead of failing at runtime.

## Backend modules (`backend/src`)

`account`, `admin`, `auth`, `avatars`, `blocks`, `comments`, `common`, `config`, `feed`, `follows`, `health`, `legal`, `likes`, `media`, `moderation`, `notifications`, `observability`, `prisma`, `redis`, `shares`, `throttling`, `uploads`, `users`, `videos`.

- **media** holds the Mux provider (behind a `MediaProvider` interface), the webhook controller and the BullMQ processor. It replaces a separate `streaming` module.
- **throttling** holds `AppThrottlerGuard` (Redis-backed rate limits).
- **moderation / admin / blocks / account** implement reports, bans, blocking and account deletion.

All routes are served under `/v1`. Swagger lives at `/docs` (disabled in production).

## Request pipeline

Global guards run in this order: `JwtAuthGuard` → `RolesGuard` → `BannedGuard` → `AppThrottlerGuard`. A global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) validates bodies, and a global exception filter returns `{ statusCode, error, message, requestId }`. Routes opt out of auth with `@Public()`.

## Video upload and playback

```text
mobile ──POST /videos/upload──► API ──create direct upload──► Mux
mobile ──────────── upload file directly ───────────────────► Mux
Mux ──webhook /webhooks/mux (HMAC)──► API ──enqueue──► BullMQ `media`
media processor: video.asset.ready → status READY, store muxAssetId / muxPlaybackId / duration
mobile plays  https://stream.mux.com/{playbackId}.m3u8   (thumbnail: image.mux.com/{playbackId}/thumbnail.jpg)
```

- The webhook returns 200 quickly; work happens in the `media` queue. Redeliveries are deduped by using Mux's event id as the BullMQ job id, and state changes are conditional updates.
- Video status: `UPLOADING → PROCESSING → READY` (or `FAILED`).
- We don't store original videos; Mux keeps the master. Cloudflare R2 holds **avatars only** (presigned PUT URLs).

## Feed

- **For You** is a ranked list built in SQL: `(2·likes + 3·comments + 4·shares + 1) / (ageHours + 2)^1.5`, over videos published in the last `FEED_WINDOW_DAYS` (14). It excludes the viewer's own videos, hidden videos, blocked authors, and anything watched in the last 24 h (a Redis sorted set).
- The ranked ids are cached in Redis as a **snapshot** (`FEED_SNAPSHOT_SIZE` 200, TTL `FEED_SNAPSHOT_TTL_SEC` 1800). The cursor is `<snapshotId>:<offset>`, so paging is stable while scores change. An expired snapshot restarts the feed. Anonymous viewers share one snapshot cached for `ANON_FEED_CACHE_SEC`.
- Visibility is re-checked when each page is loaded.
- **Following** returns the newest videos from followed creators, with a video-id cursor.
- A view counts after 3 s of playback (or half of a clip shorter than 6 s), debounced 1 h per viewer.

## Background jobs and notifications

BullMQ queues on Redis: `media` (Mux events, asset deletion) and `notifications` (fan-out for LIKE, COMMENT, FOLLOW, REPLY). Redis also backs rate limiting and the feed caches. Push notifications are deferred; in-app notifications and an unread badge cover the MVP.

## Mobile

Expo + Expo Router + `expo-video`. TanStack Query owns server data (feed pages, profiles, comments, optimistic updates); Zustand holds only the auth session and the active feed index.

## Observability

Sentry in the API (`@sentry/nestjs`) and mobile (`@sentry/react-native`), structured pino logs (`nestjs-pino`) with `requestId` and `userId`, and an optional PostHog integration. `/v1/health` returns 503 if the database or Redis is down.

## Deployment

Railway (API + Postgres, `staging` and `production` environments), Upstash Redis, EAS Build/Update for mobile. `main` deploys to staging after CI; a `v*` tag deploys to production after approval (`.github/workflows/deploy.yml`). See [Launch Runbook](Launch-Runbook).
