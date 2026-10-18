# Phase 4 — Social Interactions (Days 29–35)

**Status:** ✅ done (see *Implementation notes* for where the build differs from the original plan)

## Goal
Users can comment and reply, share videos, and receive notifications for likes, comments, replies and follows.

## Scope
- **In:** the `comments` and `notifications` modules, the share endpoint, the event → queue → notification pipeline.
- **Out:** push notifications to devices (Phase 7 nice-to-have via Expo Push), real-time sockets, @mentions and hashtags.

## Prerequisites
- Phase 3 done; `follow.created` and `like.created` events exist.

## Tasks

### Days 29–30 — Comments module
- [x] `comments/comments.module.ts`, `comments.service.ts`, `comments.controller.ts`, `comments/dto/*`
- [x] `POST /videos/:id/comments` with body `{ body, parentId? }`. Replies are **one level deep**: if `parentId` points to a reply, attach the new comment to that reply's parent. Increment `Video.commentCount` (and the parent's `replyCount`) in a transaction.
- [x] `GET /videos/:id/comments`: top-level comments, `createdAt desc`, cursor; each includes `replyCount`
- [x] `GET /comments/:id/replies`: `createdAt asc`, cursor
- [x] `DELETE /comments/:id`: author of the comment or of the video, or an admin. Soft delete (`deletedAt`); the body is shown as "[deleted]" and the counts are decremented.
- [x] Sanitize: trim the body, collapse 3+ newlines, reject an empty body, max 500 characters
- [x] Emit `comment.created` (`{ actorId, videoId, videoAuthorId, commentId, parentAuthorId? }`)
- [x] Shared types in `packages/shared/src/api/comments.ts`

### Day 31 — Shares
- [x] `POST /videos/:id/share` with body `{ channel?: 'copy_link'|'system'|'other' }`: increments `shareCount` (debounced per user and video, 1 h) and returns `{ shareUrl }`
- [x] `shareUrl` is `${PUBLIC_WEB_URL}/v/${videoId}`. `GET /v/:id` (outside the `/v1` prefix) serves a tiny landing page with Open Graph tags and an "Open in ShortVid" link to `shortvid://video/:id`, which Phase 5 handles.

### Days 32–33 — Notifications pipeline
- [x] `notifications/notifications.module.ts`, `notifications.service.ts`, `notifications.controller.ts`
- [x] `notifications/notifications.listener.ts`: `@OnEvent` for `follow.created`, `like.created`, `comment.created` → enqueue a job on the `notifications` BullMQ queue
- [x] `notifications/notifications.processor.ts` creates `Notification` rows:
  - never notify yourself (actor == recipient)
  - LIKE: dedupe, so there's at most one unread LIKE per (actor, video)
  - COMMENT → video author; REPLY → parent comment author (and video author, if different, gets COMMENT)
  - FOLLOW → followed user
- [x] `GET /notifications?cursor&limit` returns items with the actor `UserSummary`, plus a video thumbnail and the comment snippet when relevant
- [x] `GET /notifications/unread-count`
- [x] `PATCH /notifications/:id/read` and `POST /notifications/read-all`

### Days 34–35 — Polish & buffer
- [x] Add `commentCount` to the ranking (already in the formula) and make sure the feed reflects it
- [ ] ~~Rate limits per route: comments 10/min per user, follows 30/min~~ **Moved to Phase 6.** Decorators do nothing without the throttler guard, so all rate limiting lands there in one place.
- [x] Update contracts

## Contracts

| Method | Path | Auth | Body / Query | Response |
|---|---|---|---|---|
| POST | `/videos/:id/comments` | user | `{ body, parentId? }` | `CommentDto` |
| GET | `/videos/:id/comments` | public | `cursor, limit` | `Paginated<CommentDto>` |
| GET | `/comments/:id/replies` | public | `cursor, limit` | `Paginated<CommentDto>` |
| DELETE | `/comments/:id` | author/video-author/admin | — | 204 (idempotent soft delete) |
| POST | `/videos/:id/share` | optional | `{ channel? }` (`copy_link`\|`system`\|`other`) | `{ shareUrl }`, counted once per viewer per hour |
| GET | `/v/:id` | public | — | HTML landing page (404 page if hidden or missing) |
| GET | `/notifications` | user | `cursor, limit` | `Paginated<NotificationDto>` |
| GET | `/notifications/unread-count` | user | — | `{ count }` |
| PATCH | `/notifications/:id/read` | owner | — | 204 |
| POST | `/notifications/read-all` | user | — | 204 |

```ts
type CommentDto = { id; videoId; parentId: string | null; body: string /* '[deleted]' if deleted */;
  deleted: boolean; replyCount: number; author: UserSummary; createdAt: string };
type NotificationDto = { id; type: 'LIKE'|'COMMENT'|'REPLY'|'FOLLOW'; actor: UserSummary;
  video: { id; thumbnailUrl: string | null } | null; commentId: string | null;
  commentSnippet: string | null /* first 100 chars, null if deleted */; read: boolean; createdAt: string };
type UnreadCountResponse = { count: number };
```
All types are in `@app/shared` (`api/comments.ts`, `api/notifications.ts`). `PATCH /notifications/:id/read` returns 404 for someone else's notification.

**New env vars**
```dotenv
PUBLIC_WEB_URL=http://localhost:3000
```

## Done when
- [x] Comment, reply and delete keep `commentCount` / `replyCount` correct
- [x] Liking, commenting, replying and following produce the right notification for the right person, and never one for yourself
- [x] Liking, unliking and liking again doesn't create two unread LIKE notifications
- [x] The unread count drops after `read` and `read-all`

## Tests
- Unit:
  - `comment-body.spec.ts`: sanitizing.
  - `plan-notifications.spec.ts`: table of who gets which notification, covering self-actions, replies to the video author, and replies on your own video.
  - `share-page.spec.ts`: HTML escaping and Open Graph tags.
- E2E: the real queue runs, and tests wait for it to drain.
  - `comments.e2e-spec.ts` (8 tests):
    - paging and order
    - flattening, and the event payload
    - sanitizing and validation
    - visibility
    - idempotent delete and counters
    - deleted-with-replies display
    - delete permissions
  - `shares.e2e-spec.ts` (3 tests):
    - debounce per user and per IP
    - validation and visibility
    - landing page escaping, CSP, and that it isn't served under `/v1`
  - `notifications.e2e-spec.ts` (7 tests):
    - fan-out with hydrated details
    - reply routing
    - no self-notifications
    - LIKE dedupe, and a fresh notification after read
    - unread count, read, read-all, and 404 for others
    - deleted comment and deleted video
    - paging

## Implementation notes (where the build differs from the original plan)
- **Events are awaited** with `emitAsync`, so the notification job is in Redis before the like, follow or comment request returns. The listener catches queue errors, so a Redis hiccup never fails the user's action.
- **Who gets notified** is a pure function (`planNotifications`). Replies keep the author of the comment actually replied to, even after flattening to the top-level parent. The video author gets COMMENT for every comment, unless they're the one who got the REPLY.
- **Dedupe** skips a notification when an unread one with the same `(recipient, actor, type, video)` already exists. It applies to LIKE as planned, and also to FOLLOW, so follow/unfollow spam doesn't stack up. COMMENT and REPLY aren't deduped.
- **Soft delete is idempotent**: a conditional `updateMany` only moves the counters the first time. Deleted top-level comments stay visible as `[deleted]` only while they have replies; deleted replies are left out. You can't reply to a deleted comment.
- **Comments and shares use `VideosService.assertVisible`**, the same visibility rule as `GET /videos/:id`.
- **Shares and views share `common/viewer-key.ts`** (user id, or a hashed IP).
- **The `/v/:id` page** overrides helmet's CSP to allow Mux thumbnails and inline styles; everything else stays locked down.
- **Rate limits** for comments and follows moved to Phase 6 (see above).

## Risks & notes
- Processing BullMQ jobs inside the API process is fine for the MVP. Split into a separate `worker` entrypoint (`backend/src/worker.ts`) when CPU or latency starts to suffer.
