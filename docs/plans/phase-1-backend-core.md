# Phase 1 — Core Backend Foundation (Days 4–12)

## Goal
Users can sign up, log in, refresh tokens, view and edit profiles, and follow or unfollow each other. The full MVP data model is migrated now, so later phases add logic but rarely change the schema.

## Scope
- **In:** Prisma schema for all MVP entities, the `auth`, `users` and `follows` modules, global validation, error format, `/v1` versioning, roles.
- **Out:** password reset email (stubbed; see Risks), social login, avatar upload (Phase 5 uses R2 presign).

## Prerequisites
- Phase 0 done.

## Tasks

### Day 4 — Schema & migration
- [ ] Write `backend/prisma/schema.prisma` (see Contracts) and run `prisma migrate dev --name init`
- [ ] `backend/prisma/seed.ts`: 5 users with follows between them. Wire it to `prisma db seed`.

### Day 5 — App-wide plumbing
- [ ] `main.ts`: `app.setGlobalPrefix('v1')`, global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`, CORS, `helmet`
- [ ] `common/filters/http-exception.filter.ts`: emits the `{ statusCode, error, message, requestId }` shape and maps Prisma `P2002` → 409 and `P2025` → 404
- [ ] `common/middleware/request-id.middleware.ts` (`x-request-id`)
- [ ] `common/decorators/public.decorator.ts`, `current-user.decorator.ts`, `roles.decorator.ts`
- [ ] `common/guards/roles.guard.ts`

### Days 6–7 — Auth module
- [ ] `auth/auth.module.ts`, `auth.service.ts`, `auth.controller.ts`
- [ ] `auth/strategies/jwt.strategy.ts`. Register `JwtAuthGuard` as a global `APP_GUARD` that honours `@Public()`.
- [ ] Signup: validate the DTO, hash with `argon2`, create the user, issue tokens
- [ ] Login: verify the password, issue tokens. The error message is the same for an unknown email and a wrong password.
- [ ] Refresh: look up the hashed refresh token, **rotate it** (revoke the old one, issue a new one). If a revoked token is reused, revoke all of that user's tokens.
- [ ] Logout: revoke the presented refresh token
- [ ] `GET /auth/me`
- [ ] Move the DTO types to `packages/shared/src/api/auth.ts`

### Days 8–9 — Users module
- [ ] `users/users.module.ts`, `users.service.ts`, `users.controller.ts`, `users/dto/update-user.dto.ts`
- [ ] `GET /users/:id` (public) returns the profile plus `followerCount`, `followingCount`, `videoCount` and `isFollowing` (when authenticated)
- [ ] `GET /users/by-username/:username` (public)
- [ ] `PATCH /users/:id`: allowed only for the user themself or an `ADMIN`; `username` stays unique (409 on conflict)
- [ ] `GET /users/:id/videos`: returns an empty paginated list for now (filled in during Phase 3)

### Days 10–11 — Follows module
- [ ] `follows/follows.module.ts`, `follows.service.ts`, `follows.controller.ts`
- [ ] `POST /users/:id/follow`: idempotent (return 200 if already following), 400 when following yourself
- [ ] `DELETE /users/:id/follow`: idempotent
- [ ] Update the denormalized `followerCount` / `followingCount` in the same transaction as the follow row
- [ ] `GET /users/:id/followers` and `GET /users/:id/following` (cursor-paginated)
- [ ] Emit a `follow.created` event (`@nestjs/event-emitter`). Phase 4 turns it into a notification.

### Day 12 — Buffer & docs
- [ ] Swagger at `/docs` (`@nestjs/swagger`)
- [ ] Fix anything left over and update this plan's contracts if they changed

## Contracts

### Prisma schema (MVP-complete)
```prisma
enum Role { USER ADMIN }
enum VideoStatus { UPLOADING PROCESSING READY FAILED }
enum NotificationType { LIKE COMMENT FOLLOW REPLY }

model User {
  id             String   @id @default(cuid())
  email          String   @unique
  username       String   @unique
  passwordHash   String
  displayName    String?
  bio            String?  @db.VarChar(160)
  avatarUrl      String?
  role           Role     @default(USER)
  followerCount  Int      @default(0)
  followingCount Int      @default(0)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  videos        Video[]
  likes         Like[]
  comments      Comment[]
  followers     Follow[]        @relation("following")
  following     Follow[]        @relation("follower")
  refreshTokens RefreshToken[]
  notifications Notification[]  @relation("recipient")
  actedNotifs   Notification[]  @relation("actor")
}

model RefreshToken {
  id        String    @id @default(cuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}

model Video {
  id            String      @id @default(cuid())
  authorId      String
  caption       String?     @db.VarChar(300)
  status        VideoStatus @default(UPLOADING)
  muxUploadId   String?     @unique
  muxAssetId    String?     @unique
  muxPlaybackId String?
  durationSec   Float?
  aspectRatio   String?
  likeCount     Int         @default(0)
  commentCount  Int         @default(0)
  shareCount    Int         @default(0)
  viewCount     Int         @default(0)
  hidden        Boolean     @default(false)
  publishedAt   DateTime?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  author        User        @relation(fields: [authorId], references: [id], onDelete: Cascade)
  likes         Like[]
  comments      Comment[]
  @@index([authorId, publishedAt])
  @@index([status, publishedAt])
}

model Like {
  userId    String
  videoId   String
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  video     Video    @relation(fields: [videoId], references: [id], onDelete: Cascade)
  @@id([userId, videoId])
  @@index([videoId])
}

model Comment {
  id        String    @id @default(cuid())
  videoId   String
  authorId  String
  parentId  String?
  body      String    @db.VarChar(500)
  replyCount Int      @default(0)
  createdAt DateTime  @default(now())
  deletedAt DateTime?
  video     Video     @relation(fields: [videoId], references: [id], onDelete: Cascade)
  author    User      @relation(fields: [authorId], references: [id], onDelete: Cascade)
  parent    Comment?  @relation("replies", fields: [parentId], references: [id])
  replies   Comment[] @relation("replies")
  @@index([videoId, createdAt])
  @@index([parentId, createdAt])
}

model Follow {
  followerId  String
  followingId String
  createdAt   DateTime @default(now())
  follower    User     @relation("follower",  fields: [followerId],  references: [id], onDelete: Cascade)
  following   User     @relation("following", fields: [followingId], references: [id], onDelete: Cascade)
  @@id([followerId, followingId])
  @@index([followingId])
}

model Notification {
  id          String           @id @default(cuid())
  recipientId String
  actorId     String
  type        NotificationType
  videoId     String?
  commentId   String?
  readAt      DateTime?
  createdAt   DateTime         @default(now())
  recipient   User             @relation("recipient", fields: [recipientId], references: [id], onDelete: Cascade)
  actor       User             @relation("actor",     fields: [actorId],     references: [id], onDelete: Cascade)
  @@index([recipientId, createdAt])
}
```

### Endpoints
| Method | Path | Auth | Body / Query | Response |
|---|---|---|---|---|
| POST | `/auth/signup` | public | `{ email, username, password }` (username `^[a-z0-9_.]{3,24}$`, password ≥ 8) | `AuthResponse` |
| POST | `/auth/login` | public | `{ email, password }` | `AuthResponse` |
| POST | `/auth/refresh` | public | `{ refreshToken }` | `AuthResponse` |
| POST | `/auth/logout` | user | `{ refreshToken }` | 204 |
| GET | `/auth/me` | user | — | `UserProfile` |
| GET | `/users/:id` | public | — | `UserProfile` |
| GET | `/users/by-username/:username` | public | — | `UserProfile` |
| PATCH | `/users/:id` | self/admin | `{ displayName?, bio?, username?, avatarUrl? }` | `UserProfile` |
| GET | `/users/:id/videos` | public | `cursor, limit` | `Paginated<VideoDto>` |
| POST | `/users/:id/follow` | user | — | `{ following: true }` |
| DELETE | `/users/:id/follow` | user | — | `{ following: false }` |
| GET | `/users/:id/followers` | public | `cursor, limit` | `Paginated<UserSummary>` |
| GET | `/users/:id/following` | public | `cursor, limit` | `Paginated<UserSummary>` |

`AuthResponse = { accessToken, refreshToken, user: UserProfile }`

### New env vars
```dotenv
JWT_ACCESS_SECRET=change-me
JWT_ACCESS_TTL=15m
REFRESH_TOKEN_TTL_DAYS=30
```

## Done when
- [ ] Signup → login → `/auth/me` → refresh → logout works through Swagger and in e2e tests
- [ ] Reusing a rotated refresh token returns 401 and revokes the whole token family
- [ ] Follow and unfollow are idempotent, and the counts stay correct under repeated calls
- [ ] Error responses follow the shared shape, and a duplicate username returns 409

## Tests
- Unit: `AuthService` (hash and verify, rotation, reuse detection), `FollowsService` (self-follow, idempotency).
- E2E (supertest against the test DB, truncated per test file): the full auth flow, profile update permissions, follow/unfollow counts.

## Risks & notes
- **Password reset** needs an email provider. Stub a `POST /auth/forgot-password` that logs the token in development. Add Resend or Postmark in Phase 7 if beta users need it.
- Keep the counters (`followerCount`, etc.) inside transactions. A nightly reconcile job can come later if they drift.
