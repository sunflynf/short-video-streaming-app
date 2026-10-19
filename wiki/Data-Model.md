# Data Model

Prisma schema: `backend/prisma/schema.prisma`. IDs are `cuid()` strings; times are UTC.

## Enums

| Enum | Values |
|---|---|
| `Role` | `USER`, `ADMIN` |
| `VideoStatus` | `UPLOADING`, `PROCESSING`, `READY`, `FAILED` |
| `ReportReason` | `SPAM`, `HARASSMENT`, `NUDITY`, `VIOLENCE`, `OTHER` |
| `NotificationType` | `LIKE`, `COMMENT`, `FOLLOW`, `REPLY` |

## Models

| Model | Key fields | Notes |
|---|---|---|
| `User` | `email` (unique), `username` (unique), `passwordHash`, `displayName`, `bio` (≤160), `avatarUrl`, `role`, `bannedAt`, `followerCount`, `followingCount` | Banned users can read but every write returns 403 |
| `RefreshToken` | `userId`, `tokenHash` (unique), `expiresAt`, `revokedAt` | Cascades with the user |
| `Video` | `authorId`, `caption` (≤300), `status`, `muxUploadId`, `muxAssetId`, `muxPlaybackId`, `durationSec`, `aspectRatio`, `likeCount`, `commentCount`, `shareCount`, `viewCount`, `hidden`, `publishedAt` | Indexes: `(authorId, publishedAt)`, `(status, publishedAt)` |
| `Like` | PK `(userId, videoId)` | Index on `videoId` |
| `Comment` | `videoId`, `authorId`, `parentId`, `body` (≤500), `replyCount`, `deletedAt` | Replies via `parentId`; soft delete |
| `Follow` | PK `(followerId, followingId)` | Indexed both directions by `createdAt` |
| `Notification` | `recipientId`, `actorId`, `type`, `videoId`, `commentId`, `readAt` | Index `(recipientId, createdAt)` |
| `Report` | `reporterId`, `videoId` or `commentId`, `reason`, `details` (≤500), `resolvedAt`, `resolvedById` | Unique per `(reporter, target)`, so counts are distinct reporters |
| `Block` | PK `(blockerId, blockedId)` | Works in both directions |

## Relationships

- A user has many videos, likes, comments, follows (as follower and as followed), notifications (as recipient and actor), reports and blocks.
- A video has many likes, comments and reports; a comment has many replies.
- Deleting a user cascades to everything they own. Counters kept on other users and videos (followers, likes, comments, replies) are fixed in the same transaction.

## Denormalized counters

`followerCount`, `followingCount`, `likeCount`, `commentCount`, `replyCount`, `shareCount` and `viewCount` are updated in the same transaction as the change that causes them. The feed ranking reads them directly.

## Migrations

Expand → migrate → contract: a release only adds columns/tables or makes them optional, so the previous image keeps working. Never edit an applied migration.
