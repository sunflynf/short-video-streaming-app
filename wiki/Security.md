# Security

Summary of `docs/security.md` (state at the end of Phase 7). Update it whenever a route, limit or auth rule changes; the repo file has the full per-route authorization table.

## Guards and rate limits

Global guards in order: `JwtAuthGuard`, `RolesGuard`, `BannedGuard` (banned accounts get 403 on every non-GET request except logout), `AppThrottlerGuard`.

| Area | Limit |
|---|---|
| Signup / forgot- and reset-password | 3/min per IP |
| Login | 5/min per IP + email |
| Follow, block | 30/min |
| Like, view, share | 60/min |
| Comment, report | 10/min |
| Account deletion | 5/min |
| Video upload | 10/hour; max 3 in progress and 20 per day per user |
| Mux webhook | not throttled (HMAC verified, 5 min tolerance) |

Auth behaviors: same error for unknown email and wrong password; constant-time verify; refresh-token rotation, with reuse revoking all sessions; forgot-password always returns 204.

## Moderation, blocking, deletion

- **Reports:** one per person per target. Five open reports from different people hide a video until an admin reviews it.
- **Bans:** set `bannedAt` and revoke refresh tokens; writes are refused immediately, reads work until the access token expires (≤15 min).
- **Blocks** apply in both directions (feeds, profile, single video → 404, comments, notifications, follow, like) and remove follows both ways.
- **Account deletion** runs one transaction that fixes counters and cascades the user's data; Mux assets and unfinished uploads are removed by queued jobs.

## Input validation

Global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted`. Every string has a max length (bio 160, caption 300, comment 500, email 254, password 8–128, …); `limit` is 1–50; JSON body limit 100 kB. Raw SQL exists only in the feed ranking (parameterized tagged template).

## Transport and logging

- `helmet` defaults; the share page relaxes CSP only for Mux thumbnails and inline styles.
- CORS: production allows only `CORS_ORIGINS` (unset = no browser origin). `TRUST_PROXY=1` on Railway.
- Swagger disabled in production.
- Logs never include headers or bodies; Sentry strips IPs; raw IPs are never stored (SHA-256 for debouncing).

## Known gaps

- No account lockout or CAPTCHA (throttling only).
- Access tokens can't be revoked before expiry (15 min); role changes apply at next refresh.
- Avatar files in R2 are not removed on account deletion.
- Coordinated reports can hide a video until review.
- Mux direct uploads use `cors_origin: '*'`.
- `pnpm audit --prod`: three accepted build-time-only findings in Expo's toolchain (`node-forge`, `braces`, `uuid`); backend has none. Re-run before each release.
