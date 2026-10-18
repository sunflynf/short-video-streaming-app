# Security Review (Phase 6)

This is the state of the API at the end of Phase 6. Update it whenever a route, a limit or an auth rule changes.

## Authorization: mutating routes

Every route needs a valid access token unless it's marked **public**. The global `JwtAuthGuard` runs first, then `RolesGuard`, then the rate limiter (`AppThrottlerGuard`). All rules in this table are covered by e2e tests (`backend/test/*.e2e-spec.ts`).

| Route | Who may call it | Enforced by | Rate limit |
|---|---|---|---|
| `POST /auth/signup` | public | — | 3/min per IP |
| `POST /auth/login` | public | Same error for an unknown email and a wrong password; constant-time verify | 5/min per IP + email |
| `POST /auth/refresh` | public (refresh token) | Rotation; reusing a token revokes all of that user's sessions | default |
| `POST /auth/forgot-password`, `/reset-password` | public | Always 204 (no account probing); single-use token signed with the password hash | 3/min per IP |
| `POST /auth/logout` | user | Only revokes the caller's own token (`userId` in the where clause) | default |
| `PATCH /users/:id` | self or `ADMIN` | `UsersService.update`; with R2 configured, `avatarUrl` must be under `R2_PUBLIC_URL` | default |
| `POST /users/me/avatar-upload-url` | user | Key is under `avatars/<own id>/`; URL signed for the exact type and size | default |
| `POST`/`DELETE /users/:id/follow` | user (acts as self) | Can't follow yourself | 30/min |
| `POST /videos/upload` | user | Max 3 in progress and 20 per day per user | 10/hour |
| `PATCH /videos/:id` | author | `VideosService.update` | default |
| `DELETE /videos/:id` | author or `ADMIN` | `VideosService.remove` | default |
| `POST`/`DELETE /videos/:id/like` | user (acts as self) | Like requires READY and not hidden | 60/min |
| `POST /videos/:id/view` | public | READY and not hidden; debounced 1 h per viewer | 60/min |
| `POST /videos/:id/share` | public | Visible to the caller; debounced 1 h per viewer | 60/min |
| `POST /videos/:id/comments` | user | Video visible to the caller; the parent must be on the same video and not deleted | 10/min |
| `DELETE /comments/:id` | comment author, video author, or `ADMIN` | `CommentsService.remove` | default |
| `PATCH /notifications/:id/read`, `POST /notifications/read-all` | owner | `recipientId` in the where clause; 404 for others | default |
| `POST /webhooks/mux` | Mux | HMAC signature (`mux-signature`, 5 min tolerance) | not throttled |
| `GET /admin/queues`, `POST /admin/sentry-test` | `ADMIN` | `@Roles('ADMIN')` | default |

**Private reads:**
- `GET /auth/me`: the caller.
- `GET /users/:id/liked`: the caller only.
- `GET /notifications*`: the caller's own notifications.
- Unpublished or hidden videos: the author and admins only. Everyone else gets 404, not 403, so their existence isn't leaked.

## Input validation (DTO audit)

- **Validation pipe:** a global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted` (unknown fields are rejected) and `transform`.
- **Strings:** every string field has a max length:
  - username: the pattern, 3–24 characters
  - display name: 50
  - bio: 160
  - caption: 300
  - comment: 500
  - email: 254
  - password: 8–128
  - tokens: 256 or 2048
  - cursors: 256
  - avatar URL: 2048, https only
- **Enums and numbers:** enums use `@IsIn` (feed tab, share channel, avatar content type). Numbers are bounded: `limit` 1–50, `watchedMs` 0–1 h, avatar size ≤ 5 MB.
- **Path IDs aren't format-checked:** Prisma parameterizes every query, and an unknown ID gives 404. A cuid format check would only turn some 404s into 400s.
- **Raw SQL** exists only in the feed ranking (`$queryRaw` tagged template, so it's parameterized) and a test helper.
- **Body size:** JSON bodies are limited to **100 kB**. Oversized bodies get 413, and malformed JSON gets 400. Both are in the shared error shape, never a 500.

## Transport and headers

- **helmet** defaults are on. The `/v/:id` share page relaxes CSP only enough to allow Mux thumbnails and inline styles.
- **CORS:** in production only `CORS_ORIGINS` is allowed; with it unset, no browser origin is allowed. Development allows any origin. Native apps don't send `Origin`.
- **`TRUST_PROXY`:** the number of proxy hops (1 on Railway), so rate limits and debouncing see the client's IP from `X-Forwarded-For` rather than the proxy's.
- **Swagger** (`/docs`) is disabled in production.

## Secrets and personal data in logs

- **Request logs** (pino) include method, path (without the query string), status, timing, `requestId` and `userId`. Headers are never logged: the request serializer drops them, and `authorization`, `cookie` and `mux-signature` are also listed as redacted.
- **Bodies** aren't logged, so passwords and refresh tokens can't leak.
- **Sentry** events carry the `requestId` tag and the user ID. IP addresses are removed in `beforeSend`, and `sendDefaultPii` is off on mobile.
- **IPs at rest:** raw client IPs are never stored. View and share debouncing use a SHA-256 of the IP.

## Dependency audit (`pnpm audit --prod`)

| Package | Severity | Path | Status |
|---|---|---|---|
| `node-forge` ≤ 1.4.0 | high | `expo › @expo/cli` | No patched version. Build-time CLI only; not in the app bundle or the API. Accepted. |
| `braces` ≤ 3.0.3 | high | `expo › @expo/metro › micromatch` | No patched version. Bundler only (dev and build). Accepted. |
| `uuid` < 11.1.1 | moderate | `expo › @expo/config-plugins › xcode` | Build-time only (iOS project generation); forcing v11 risks breaking prebuild. Accepted. |

The **backend has no findings.** Rerun this audit before each release, and drop these rows once Expo ships fixes.

## Known gaps (tracked for later)

- **Login protection:** throttling is per IP + email. There's no account lockout or CAPTCHA yet; add them if credential stuffing shows up.
- **Session lifetime:** access tokens can't be revoked before they expire (15 min). Role changes and bans take effect at the next refresh.
- **Uploads:** Mux direct uploads use `cors_origin: '*'`. That's fine for native clients; tighten it if a web uploader ships.
