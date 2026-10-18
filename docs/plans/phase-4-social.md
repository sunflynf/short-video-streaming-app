# Phase 4 — Social Interactions (Days 29–35)

## Goal
Users can comment and reply, share videos, and receive notifications for likes, comments, replies and follows.

## Scope
- **In:** the `comments` and `notifications` modules, the share endpoint, the event → queue → notification pipeline.
- **Out:** push notifications to devices (Phase 7 nice-to-have via Expo Push), real-time sockets, @mentions and hashtags.

## Prerequisites
- Phase 3 done; `follow.created` and `like.created` events exist.

## Tasks

### Days 29–30 — Comments module
- [ ] `comments/comments.module.ts`, `comments.service.ts`, `comments.controller.ts`, `comments/dto/*`
- [ ] `POST /videos/:id/comments` with body `{ body, parentId? }`. Replies are **one level deep**: if `parentId` points to a reply, attach the new comment to that reply's parent. Increment `Video.commentCount` (and the parent's `replyCount`) in a transaction.
- [ ] `GET /videos/:id/comments`: top-level comments, `createdAt desc`, cursor; each includes `replyCount`
- [ ] `GET /comments/:id/replies`: `createdAt asc`, cursor
- [ ] `DELETE /comments/:id`: author of the comment or of the video, or an admin. Soft delete (`deletedAt`); the body is shown as "[deleted]" and the counts are decremented.
- [ ] Sanitize: trim the body, collapse 3+ newlines, reject an empty body, max 500 characters
- [ ] Emit `comment.created` (`{ actorId, videoId, videoAuthorId, commentId, parentAuthorId? }`)
- [ ] Shared types in `packages/shared/src/api/comments.ts`

### Day 31 — Shares
- [ ] `POST /videos/:id/share` with body `{ channel?: 'copy_link'|'system'|'other' }`: increments `shareCount` (debounced per user and video, 1 h) and returns `{ shareUrl }`
- [ ] `shareUrl` is `${PUBLIC_WEB_URL}/v/${videoId}`. For the MVP, a tiny static page (or redirect) at that URL is enough; the deep link (`app://video/:id`) is set up in Phase 5.

### Days 32–33 — Notifications pipeline
- [ ] `notifications/notifications.module.ts`, `notifications.service.ts`, `notifications.controller.ts`
- [ ] `notifications/notifications.listener.ts`: `@OnEvent` for `follow.created`, `like.created`, `comment.created` → enqueue a job on the `notifications` BullMQ queue
- [ ] `notifications/notifications.processor.ts` creates `Notification` rows:
  - never notify yourself (actor == recipient)
  - LIKE: dedupe, so there's at most one unread LIKE per (actor, video)
  - COMMENT → video author; REPLY → parent comment author (and video author, if different, gets COMMENT)
  - FOLLOW → followed user
- [ ] `GET /notifications?cursor&limit` returns items with the actor `UserSummary`, plus a video thumbnail and the comment snippet when relevant
- [ ] `GET /notifications/unread-count`
- [ ] `PATCH /notifications/:id/read` and `POST /notifications/read-all`

### Days 34–35 — Polish & buffer
- [ ] Add `commentCount` to the ranking (already in the formula) and make sure the feed reflects it
- [ ] Rate limits per route: comments 10/min per user, follows 30/min (the throttler itself is set up in Phase 6; add the decorators now)
- [ ] Update contracts

## Contracts

| Method | Path | Auth | Body / Query | Response |
|---|---|---|---|---|
| POST | `/videos/:id/comments` | user | `{ body, parentId? }` | `CommentDto` |
| GET | `/videos/:id/comments` | public | `cursor, limit` | `Paginated<CommentDto>` |
| GET | `/comments/:id/replies` | public | `cursor, limit` | `Paginated<CommentDto>` |
| DELETE | `/comments/:id` | author/video-author/admin | — | 204 |
| POST | `/videos/:id/share` | optional | `{ channel? }` | `{ shareUrl }` |
| GET | `/notifications` | user | `cursor, limit` | `Paginated<NotificationDto>` |
| GET | `/notifications/unread-count` | user | — | `{ count }` |
| PATCH | `/notifications/:id/read` | owner | — | 204 |
| POST | `/notifications/read-all` | user | — | 204 |

```ts
type CommentDto = { id; videoId; parentId: string | null; body: string; deleted: boolean;
  replyCount: number; author: UserSummary; createdAt: string };
type NotificationDto = { id; type: 'LIKE'|'COMMENT'|'REPLY'|'FOLLOW'; actor: UserSummary;
  video?: { id; thumbnailUrl }; commentSnippet?: string; read: boolean; createdAt: string };
```

**New env vars**
```dotenv
PUBLIC_WEB_URL=http://localhost:3000
```

## Done when
- [ ] Comment, reply and delete keep `commentCount` / `replyCount` correct
- [ ] Liking, commenting, replying and following produce the right notification for the right person, and never one for yourself
- [ ] Liking, unliking and liking again doesn't create two unread LIKE notifications
- [ ] The unread count drops after `read` and `read-all`

## Tests
- Unit: reply flattening, the notification fan-out rules (table-driven), share debounce.
- E2E: comment thread pagination, delete permissions, the notifications list after a scripted sequence of actions (process the queue inline in tests).

## Risks & notes
- Processing BullMQ jobs inside the API process is fine for the MVP. Split into a separate `worker` entrypoint (`backend/src/worker.ts`) when CPU or latency starts to suffer.
