# Phase 2 — Video Upload & Media Pipeline (Days 13–20)

**Status:** ✅ built and tested against simulated Mux webhooks. ⏳ The real-upload check is waiting on Mux credentials (see *Run it against real Mux* below).

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
- [x] `backend/src/media/media-provider.ts`: `createDirectUpload(opts)`, `cancelUpload(id)`, `deleteAsset(id)`, `verifyWebhook(rawBody, headers)` (returns a provider-neutral `MediaEvent`), `playbackUrl(playbackId)`, `thumbnailUrl(playbackId)`
- [x] `backend/src/media/mux.provider.ts`, implemented with `@mux/mux-node`. `playback_policies: ['public']`, `cors_origin: *`, `video_quality: 'basic'`, `max_resolution_tier: '1080p'`. Mux-specific event parsing lives in `mux-events.ts`
- [x] `media.module.ts` provides `MEDIA_PROVIDER` as a token, so Cloudflare Stream can be swapped in later

### Day 14 — Upload endpoint
- [x] `uploads/uploads.module.ts`, `uploads.service.ts`, `uploads.controller.ts`
- [x] `POST /videos/upload` with body `{ caption? }`: create a `Video(UPLOADING)`, create the Mux direct upload with `passthrough = video.id`, save `muxUploadId`, return `{ videoId, uploadUrl }`
- [x] Per-user guards: at most 3 videos in `UPLOADING`/`PROCESSING` at once, and 20 uploads per 24 h (429 otherwise)

### Days 15–16 — Webhook + queue
- [x] Enable `rawBody: true` in `NestFactory.create`
- [x] `POST /webhooks/mux` (public): verify the signature (401 if invalid), enqueue `{ type, data }` on the `media` BullMQ queue, return 200 immediately
- [x] `backend/src/media/media.processor.ts` (BullMQ `@Processor('media')`):
  - `video.upload.asset_created` → set `muxAssetId`, status `PROCESSING`
  - `video.asset.ready` → set `muxPlaybackId`, `durationSec`, `aspectRatio`. If `durationSec > 61`, mark `FAILED` and delete the asset; otherwise mark `READY` and set `publishedAt = now()`.
  - `video.asset.errored` / `video.upload.errored` / `video.upload.cancelled` → `FAILED`
- [x] Idempotency: the BullMQ job id is the Mux event id (completed jobs kept 7 days), and every status change is a conditional update
- [x] Look up videos by `passthrough` first, with `muxUploadId`/`muxAssetId` as the fallback
- [x] Local development: receive webhooks through `ngrok http 3000` or `cloudflared` (see Risks & notes below)

### Days 17–18 — Videos module
- [x] `videos/videos.module.ts`, `videos.service.ts`, `videos.controller.ts`, `videos/dto/*`
- [x] `toVideoDto()` mapper builds `playbackUrl` and `thumbnailUrl` from the provider, and includes `author: UserSummary` and `likedByMe` (false until Phase 3)
- [x] `GET /videos/:id`: public if `READY && !hidden`; the author can see any status
- [x] `PATCH /videos/:id` with `{ caption }`: author only
- [x] `DELETE /videos/:id`: author or admin. Delete the row, then `deleteAsset` (or `cancelUpload` while still uploading) via a queue job
- [x] Fill `GET /users/:id/videos` (READY, not hidden, `publishedAt desc`, cursor)
- [x] Shared types in `packages/shared/src/api/videos.ts`

### Days 19–20 — Test with real uploads
- [x] Script `backend/scripts/upload-sample.ts` (`pnpm --filter backend upload:sample <file> [caption]`): logs in as a seed user, calls `/videos/upload`, PUTs the file, and polls until `READY`
- [ ] Test with portrait 9:16, landscape, a 70 s clip (expect `FAILED`), and a non-video file (expect `FAILED`). **Needs Mux credentials.** The same cases are covered with simulated webhooks in `test/mux-webhook.e2e-spec.ts`.
- [x] Seed script: set `SEED_MUX_PLAYBACK_IDS` (comma-separated) to create READY videos without uploading

## Contracts

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/videos/upload` | user | `{ caption? }` | `{ videoId, uploadUrl }` |
| POST | `/webhooks/mux` | public (signed) | Mux event | 200 |
| GET | `/videos/:id` | public* | — | `VideoDto` |
| PATCH | `/videos/:id` | author | `{ caption }` | `VideoDto` |
| DELETE | `/videos/:id` | author/admin | — | 204 |
| GET | `/users/:id/videos` | public | `cursor, limit` | `Paginated<VideoDto>` (READY, not hidden, newest first; cursor = last video id) |

Errors: `POST /videos/upload` returns 429 over a limit, 503 when Mux isn't configured, and 502 if Mux rejects the request. `POST /webhooks/mux` returns 401 for a bad signature and 503 without `MUX_WEBHOOK_SECRET`.

```ts
type VideoDto = {
  id: string; caption: string | null; status: 'UPLOADING'|'PROCESSING'|'READY'|'FAILED';
  playbackUrl: string | null; thumbnailUrl: string | null;
  durationSec: number | null; aspectRatio: string | null;
  likeCount: number; commentCount: number; shareCount: number;
  likedByMe: boolean; author: UserSummary; publishedAt: string | null; createdAt: string;
};
```

**New env vars**
```dotenv
MUX_TOKEN_ID=
MUX_TOKEN_SECRET=
MUX_WEBHOOK_SECRET=
MAX_VIDEO_DURATION_SEC=60
MAX_ACTIVE_UPLOADS=3
MAX_DAILY_UPLOADS=20
SEED_MUX_PLAYBACK_IDS=   # optional, seed only
```
The `MUX_*` values are optional. Leave them blank to run the API without uploads.

## Done when
- [ ] `upload-sample.ts` takes a clip from upload to `READY` with a working `playbackUrl` (it plays in VLC or Safari). **Pending Mux credentials.**
- [x] A clip longer than 60 s ends as `FAILED` and its Mux asset is deleted (simulated webhook)
- [x] Replaying a webhook (same event id) causes no duplicate state change
- [x] A webhook with a bad signature returns 401. Also checked against the compiled server with an `openssl`-signed request.

## Tests
- Unit:
  - `mux-events.spec.ts`: each Mux event type, missing fields, and ignored types.
  - `mux.provider.spec.ts`: configured flags, URL builders, and real SDK signature verification. Valid signatures pass; tampered bodies, wrong secrets, stale timestamps and missing headers fail. Also the duration-slack rule.
- E2E: the test app swaps in `test/stub-mux.provider.ts`, which records the network calls (upload, cancel, delete). Signature checks and URLs stay real, and the tests sign webhooks with the test secret.
  - `mux-webhook.e2e-spec.ts` (11 tests):
    - status flow, 401s and the 503
    - ignored event types
    - redelivery dedupe
    - out-of-order events
    - too-long clips, errored assets and cancelled uploads
    - no downgrade from READY
    - orphan asset cleanup
    - lookup by upload id
  - `videos.e2e-spec.ts` (15 tests):
    - upload, plus the auth, validation, limit, 503 and 502 cases
    - visibility for anonymous users, others, the author and admins
    - caption edit and clear permissions
    - delete with asset cleanup or upload cancel
    - profile video paging and `videoCount`

## Implementation notes (where the build differs from the original plan)
- **Idempotency** uses the BullMQ job id (the Mux event id) instead of Redis `SETNX`. Setting a key before processing would make a retried job skip itself after a transient failure. Every transition is also a conditional `updateMany`: READY is never downgraded and FAILED is final, so redelivered or out-of-order events are harmless.
- **Provider-neutral events:** `MediaProvider.verifyWebhook` returns a `MediaEvent` (`asset_created` / `ready` / `failed`), so `MediaProcessor` contains no Mux-specific code.
- **Mux is optional at boot:** missing keys make uploads return 503 and the webhook return 503, rather than stopping the API from starting.
- **Orphan cleanup:** if an event arrives for a deleted video, its asset is deleted. A failed provider call during upload deletes the new row and returns 502.
- **Daily limit** counts existing rows, so deleting a video frees a slot. That's acceptable for an MVP.
- **BullMQ 6** takes `{ url: REDIS_URL }` and uses the existing `ioredis` as a peer. Jobs run in the API process (5 attempts, exponential backoff).
- `GET /users/:id/videos` moved from `UsersController` to `UserVideosController` in the videos module.

## Run it against real Mux
1. In the Mux dashboard, create an access token with Mux Video read and write access. Put `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` in `backend/.env`.
2. Expose the API with `ngrok http 3000` (or `cloudflared tunnel --url http://localhost:3000`).
3. In Mux → Settings → Webhooks, add `https://<tunnel>/v1/webhooks/mux` for the development environment. Copy its signing secret into `MUX_WEBHOOK_SECRET`.
4. Start the API with `pnpm --filter backend dev`, then run `pnpm --filter backend upload:sample ./clip.mp4 "first clip"`. It should print a playback URL that plays in Safari or VLC.
5. Repeat with a landscape clip, a 70 s clip (expect `FAILED`, and the asset disappears in Mux), and a non-video file (expect `FAILED`).

## Risks & notes
- **Local webhooks:** run `ngrok http 3000` and point a *development* Mux webhook at `https://<id>.ngrok.app/v1/webhooks/mux`.
- **Direct upload URLs expire** (default 1 h). The mobile client should request one just before uploading.
- **Cost guard:** Mux bills for stored and delivered minutes. Cap per-user uploads per day (for example 20) in `UploadsService`.
- Mux checks duration only after ingest. Also check the clip length on the client (Phase 5) so users aren't left waiting on a guaranteed failure.
