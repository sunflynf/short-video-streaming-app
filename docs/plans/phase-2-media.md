# Phase 2 — Video Upload & Media Pipeline (Days 13–20)

## Goal
An authenticated user can upload a 15–60 s vertical clip. It's transcoded by Mux, and the video becomes `READY` with an HLS playback URL and a thumbnail.

## Scope
- **In:** the `uploads` and `videos` modules, the Mux integration behind a `MediaProvider` interface, webhook handling via BullMQ, status flow, video CRUD.
- **Out:** feed (Phase 3), self-hosted transcoding, storing original files (see `docs/decisions.md` D5/D6).

## Prerequisites
- Phase 1 done (users, auth, `Video` model).
- Mux account with an access token (Video read/write) and a webhook signing secret.

## Flow
```text
mobile                        API                         Mux
  │ POST /videos/upload ───────►│ create Video(UPLOADING)   │
  │                             │ createDirectUpload ──────►│
  │◄── { videoId, uploadUrl } ──│                           │
  │ PUT file ──────────────────────────────────────────────►│
  │                             │◄── webhook upload.asset_created
  │                             │    → Video.muxAssetId, PROCESSING
  │                             │◄── webhook asset.ready
  │                             │    → playbackId, duration, READY, publishedAt
  │ GET /videos/:id (poll) ────►│                           │
```

## Tasks

### Day 13 — Media provider abstraction
- [ ] `backend/src/media/media-provider.interface.ts`: `createDirectUpload(opts)`, `deleteAsset(id)`, `verifyWebhook(rawBody, headers)`, `playbackUrl(playbackId)`, `thumbnailUrl(playbackId)`
- [ ] `backend/src/media/mux.provider.ts`, implemented with `@mux/mux-node`. `playback_policy: public`, `cors_origin: *` (tighten later), `new_asset_settings.max_resolution_tier: '1080p'`
- [ ] `media.module.ts` provides `MEDIA_PROVIDER` as a token, so Cloudflare Stream can be swapped in later

### Day 14 — Upload endpoint
- [ ] `uploads/uploads.module.ts`, `uploads.service.ts`, `uploads.controller.ts`
- [ ] `POST /videos/upload` with body `{ caption? }`: create a `Video(UPLOADING)`, create the Mux direct upload with `passthrough = video.id`, save `muxUploadId`, return `{ videoId, uploadUrl }`
- [ ] Per-user guard: at most 3 videos in `UPLOADING`/`PROCESSING` at the same time (429 otherwise)

### Days 15–16 — Webhook + queue
- [ ] Enable `rawBody: true` in `NestFactory.create`
- [ ] `POST /webhooks/mux` (public): verify the signature (401 if invalid), enqueue `{ type, data }` on the `media` BullMQ queue, return 200 immediately
- [ ] `backend/src/media/media.processor.ts` (BullMQ `@Processor('media')`):
  - `video.upload.asset_created` → set `muxAssetId`, status `PROCESSING`
  - `video.asset.ready` → set `muxPlaybackId`, `durationSec`, `aspectRatio`. If `durationSec > 61`, mark `FAILED` and delete the asset; otherwise mark `READY` and set `publishedAt = now()`.
  - `video.asset.errored` / `video.upload.errored` / `video.upload.cancelled` → `FAILED`
- [ ] Idempotency: process each Mux event id once (Redis `SETNX mux:evt:<id>` with a 7-day TTL)
- [ ] Look up videos by `passthrough` first, with `muxUploadId`/`muxAssetId` as the fallback
- [ ] Local development: receive webhooks through `ngrok http 3000` or `cloudflared` (see Risks & notes below)

### Days 17–18 — Videos module
- [ ] `videos/videos.module.ts`, `videos.service.ts`, `videos.controller.ts`, `videos/dto/*`
- [ ] `toVideoDto()` mapper builds `playbackUrl` and `thumbnailUrl` from the provider, and includes `author: UserSummary` and `likedByMe` (false until Phase 3)
- [ ] `GET /videos/:id`: public if `READY && !hidden`; the author can see any status
- [ ] `PATCH /videos/:id` with `{ caption }`: author only
- [ ] `DELETE /videos/:id`: author or admin. Delete the row and call `deleteAsset` (via queue job)
- [ ] Fill `GET /users/:id/videos` (READY, not hidden, `publishedAt desc`, cursor)
- [ ] Shared types in `packages/shared/src/api/videos.ts`

### Days 19–20 — Test with real uploads
- [ ] Script `backend/scripts/upload-sample.ts`: logs in as a seed user, calls `/videos/upload`, PUTs a sample mp4, and polls until `READY`
- [ ] Test with portrait 9:16, landscape, a 70 s clip (expect `FAILED`), and a non-video file (expect `FAILED`)
- [ ] Seed script: optionally attach a few known public Mux playback IDs, so feed work in Phase 3 doesn't need real uploads

## Contracts

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/videos/upload` | user | `{ caption? }` | `{ videoId, uploadUrl }` |
| POST | `/webhooks/mux` | public (signed) | Mux event | 200 |
| GET | `/videos/:id` | public* | — | `VideoDto` |
| PATCH | `/videos/:id` | author | `{ caption }` | `VideoDto` |
| DELETE | `/videos/:id` | author/admin | — | 204 |

```ts
type VideoDto = {
  id: string; caption: string | null; status: 'UPLOADING'|'PROCESSING'|'READY'|'FAILED';
  playbackUrl: string | null; thumbnailUrl: string | null;
  durationSec: number | null; aspectRatio: string | null;
  likeCount: number; commentCount: number; shareCount: number;
  likedByMe: boolean; author: UserSummary; publishedAt: string | null;
};
```

**New env vars**
```dotenv
MUX_TOKEN_ID=
MUX_TOKEN_SECRET=
MUX_WEBHOOK_SECRET=
MAX_VIDEO_DURATION_SEC=60
```

## Done when
- [ ] `upload-sample.ts` takes a clip from upload to `READY` with a working `playbackUrl` (it plays in VLC or Safari)
- [ ] A clip longer than 60 s ends as `FAILED` and its Mux asset is deleted
- [ ] Replaying a webhook (same event id) causes no duplicate state change
- [ ] A webhook with a bad signature returns 401

## Tests
- Unit: `MediaProcessor` handles each event type (Mux provider mocked), duration rule, idempotency.
- E2E: `/videos/upload` with the provider mocked; `GET /videos/:id` visibility rules (others can't see non-READY or hidden videos).

## Risks & notes
- **Local webhooks:** run `ngrok http 3000` and point a *development* Mux webhook at `https://<id>.ngrok.app/v1/webhooks/mux`.
- **Direct upload URLs expire** (default 1 h). The mobile client should request one just before uploading.
- **Cost guard:** Mux bills for stored and delivered minutes. Cap per-user uploads per day (for example 20) in `UploadsService`.
- Mux checks duration only after ingest. Also check the clip length on the client (Phase 5) so users aren't left waiting on a guaranteed failure.
