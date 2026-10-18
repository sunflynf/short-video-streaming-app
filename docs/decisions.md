# Stack Decisions

`README.md` and `STRUCTURE.md` leave several options open. This document records which option the MVP uses so the phase plans in [`docs/plans/`](./plans/README.md) can be specific. Each decision gives its reason and the condition for revisiting it.

| # | Area | Decision |
|---|------|----------|
| D1 | Repo layout | pnpm workspaces monorepo |
| D2 | Backend | NestJS + TypeScript (Express adapter) |
| D3 | Database | PostgreSQL + Prisma |
| D4 | Auth | Passport JWT inside NestJS (no Clerk / Supabase Auth) |
| D5 | Video | Mux (direct upload, transcoding, HLS, thumbnails) |
| D6 | Object storage | Cloudflare R2, for avatars only |
| D7 | Cache / jobs | Redis + BullMQ |
| D8 | Mobile | Expo + Expo Router + `expo-video` |
| D9 | Mobile state | Zustand (client state) + TanStack Query (server state) |
| D10 | Deployment | Railway (API + Postgres), Upstash Redis, EAS Build |
| D11 | Observability | Sentry (API + mobile), pino logs |

---

## D1 — pnpm workspaces monorepo

```text
apps/mobile          Expo app
apps/web-admin       (post-MVP) Next.js admin / creator dashboard
backend              NestJS API
packages/shared      Shared TS types, API DTO shapes, constants
```

- **Why:** a single repo and a single CI pipeline. Mobile and the API share types through `packages/shared`, so API contract changes break the build instead of failing at runtime.
- **Revisit when:** build times hurt (add Turborepo caching), or a separate team owns one app.

## D2 — NestJS (Express adapter)

- **Why:** the module structure already matches `STRUCTURE.md`. The Express adapter has the widest middleware compatibility (Mux webhook raw body, multer). The Fastify adapter is unnecessary for the MVP.
- **Revisit when:** profiling shows HTTP overhead is the bottleneck.

## D3 — PostgreSQL + Prisma

- **Why:** social data is relational (follows, likes, comments). Prisma migrations are fast for a solo developer.
- **Revisit when:** feed queries need SQL that Prisma can't express well. Use `$queryRaw` for those queries rather than switching ORMs.

## D4 — Passport JWT auth inside NestJS

- Short-lived access token (15 min) plus a rotating refresh token (30 days). Refresh tokens are stored hashed in a `RefreshToken` table so they can be revoked.
- Passwords are hashed with `argon2`.
- **Why:** no vendor lock-in or per-MAU cost, and the user table stays in our DB with no sync webhooks. This is enough for email + password.
- **Revisit when:** social login (Apple/Google), magic links, or MFA are needed. At that point, compare the cost of adding them against migrating to Clerk.

## D5 — Mux for video

- The client asks the API for a **direct upload URL** and uploads straight to Mux. Mux then transcodes and calls our webhook. We store `muxAssetId` and `muxPlaybackId`.
- Playback: `https://stream.mux.com/{playbackId}.m3u8`
- Thumbnail: `https://image.mux.com/{playbackId}/thumbnail.jpg?time=1`
- **Why:** this removes the whole self-built pipeline (S3 upload, ffmpeg workers, HLS packaging, thumbnails, CDN). It's the biggest time saver in the MVP.
- **Revisit when:** Mux cost per minute delivered becomes significant. Cloudflare Stream is the drop-in alternative, and the `MediaProvider` interface (Phase 2) keeps that swap contained.

## D6 — Cloudflare R2 for avatars only

- Avatars are uploaded to R2 with presigned PUT URLs, so there's no egress cost. Original video files are **not** stored by us; Mux keeps the master.
- **Revisit when:** we need to keep originals (for example to re-encode or for moderation evidence). Enable Mux master access or copy to R2 at that point.

## D7 — Redis + BullMQ

- Queues: `media` (Mux webhook processing) and `notifications` (fan-out).
- Redis is also used by the rate limiter (`@nestjs/throttler` storage) and the short-lived feed cache.
- **Why:** webhook handlers return 200 quickly, and retries are automatic.
- **Revisit when:** never for the MVP.

## D8 — Expo + Expo Router + `expo-video`

- Use the latest Expo SDK with file-based routing (Expo Router) and `expo-video` (`expo-av` video is deprecated).
- **Why:** HLS works natively on iOS and Android, EAS handles builds, and OTA updates are available.
- **Revisit when:** we need custom native video features that `expo-video` lacks. Use a dev client plus a native module at that point.

## D9 — Zustand + TanStack Query

- TanStack Query owns all server data (feed pages, profiles, comments), including caching, pagination, and optimistic updates.
- Zustand holds only client state: the auth session and the active feed index (which video is playing).
- **Why:** this is less boilerplate than Redux Toolkit plus RTK Query, and fits one developer.

## D10 — Railway + Upstash + EAS

- API and Postgres run on Railway, with `staging` and `production` environments. Redis runs on Upstash. The mobile app is built with EAS Build and updated with EAS Update.
- **Why:** git-push deploys and managed backups with no DevOps work.
- **Revisit when:** cost or region requirements change (Fly.io is the alternative).

## D11 — Sentry + pino

- Sentry runs in the API (`@sentry/nestjs`) and on mobile (`@sentry/react-native`). The API writes structured JSON logs with `nestjs-pino`.
