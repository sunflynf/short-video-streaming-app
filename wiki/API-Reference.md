# API Reference

Live, interactive docs are at `/docs` (Swagger, non-production). Request/response types are in `packages/shared/src/api/*.ts`. The authorization and rate limit for every mutating route is in [Security](Security).

## Conventions

- Base path `/v1` (e.g. `POST /v1/auth/signup`). Paths below omit it.
- Auth header: `Authorization: Bearer <accessToken>`. Endpoints require auth unless marked public.
- **Pagination:** cursor-based. Lists return `{ items: T[], nextCursor: string | null }`; pass `?cursor=&limit=` (default 10, max 50).
- **Errors:** `{ statusCode, error, message, requestId }`. Oversized bodies (>100 kB) return 413, malformed JSON 400.
- Unpublished/hidden videos and blocked relationships return **404**, not 403.

## Endpoint groups

| Group | Endpoints |
|---|---|
| Auth | `POST /auth/signup`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`; `GET /auth/me` |
| Users | `GET /users/:id`, `GET /users/by-username/:username`, `PATCH /users/:id`, `GET /users/:id/videos`, `GET /users/:id/liked` (caller only) |
| Account | `GET /users/me/stats`, `DELETE /users/me` (password required), `POST /users/me/avatar-upload-url` |
| Follows | `POST`/`DELETE /users/:id/follow`, `GET /users/:id/followers`, `GET /users/:id/following` |
| Blocks | `POST`/`DELETE /users/:id/block`, `GET /users/me/blocks` |
| Videos | `POST /videos/upload`, `GET /videos/:id`, `PATCH /videos/:id`, `DELETE /videos/:id` |
| Feed | `GET /videos/feed` (For You / Following), `POST /videos/:id/view` |
| Likes | `POST`/`DELETE /videos/:id/like` |
| Comments | `POST`/`GET /videos/:id/comments`, `GET /comments/:id/replies`, `DELETE /comments/:id` |
| Shares | `POST /videos/:id/share`; public share page `GET /v/:id` |
| Notifications | `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `POST /notifications/read-all` |
| Moderation | `POST /videos/:id/report`, `POST /comments/:id/report` |
| Admin (`ADMIN`) | `GET /admin/reports`, `POST /admin/reports/resolve`, `POST /admin/videos/:id/hide` and `/unhide`, `POST /admin/comments/:id/remove`, `POST /admin/users/:id/ban` and `/unban`, `GET /admin/queues`, `POST /admin/sentry-test` |
| Webhooks | `POST /webhooks/mux` (HMAC `mux-signature`) |
| Legal / health | `GET /legal/terms`, `GET /legal/privacy` (HTML), `GET /health` |

Check the controllers in `backend/src/*/*.controller.ts` for exact parameters; this table is a map, not a contract.
