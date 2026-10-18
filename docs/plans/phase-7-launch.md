# Phase 7 — MVP Launch Prep (Days 53–60)

## Goal
Run staging and production environments, ship builds to beta testers (TestFlight / Play internal testing), and be able to see and act on problems.

## Scope
- **In:** deployment pipeline, environment config, migrations on deploy, a basic moderation hook, minimal creator stats, analytics events, a launch checklist.
- **Out:** public store launch marketing, the web admin app (post-MVP), monetization.

## Prerequisites
- Phase 6 done. Accounts: Railway, Upstash, Cloudflare (R2), Apple Developer, Google Play Console, Sentry.

## Tasks

### Days 53–54 — Backend deployment
- [ ] `backend/Dockerfile` (multi-stage, `node:20-slim`, `prisma generate` at build time, non-root user)
- [ ] Railway project with `staging` and `production` environments, each with its own Postgres. Upstash Redis per environment.
- [ ] Release command: `prisma migrate deploy` runs before the new version takes traffic
- [ ] GitHub Actions: `main` → deploy to staging automatically; a tag `v*` → deploy to production (manual approval via environment protection)
- [ ] Separate Mux environments and webhook endpoints for staging and production; separate R2 buckets
- [ ] Daily Postgres backups enabled, with one restore tested on staging

### Day 55 — Mobile release pipeline
- [ ] `eas.json` profiles: `development`, `preview` (staging API, internal distribution), `production`
- [ ] App icons, splash screen, bundle IDs, versioning (`appVersionSource: remote`, auto-increment)
- [ ] EAS Update channels that match the profiles, for JS-only hotfixes
- [ ] Submit a `preview` build to TestFlight and Play internal testing

### Day 56 — Moderation hook
- [ ] `Report` model `{ id, reporterId, videoId?, commentId?, reason, createdAt, resolvedAt? }` + migration
- [ ] `POST /videos/:id/report` and `POST /comments/:id/report`; the mobile action is in the `…` menu
- [ ] Admin-only: `GET /admin/reports`, `POST /admin/videos/:id/hide` (sets `hidden=true`), `POST /admin/users/:id/ban` (add `bannedAt` to `User`; banned users get 403 on writes)
- [ ] Auto-hide when a video gets ≥ 5 distinct reports, pending review
- [ ] Block list (optional if time allows): `Block` model, filtered out of feed and comments

### Day 57 — Creator stats (minimal)
- [ ] `GET /users/me/stats` returns totals (views, likes, comments, followers) and the last 7 days of follower gains (derived from `Follow.createdAt`)
- [ ] Per-video stats on the creator's own profile grid (view count overlay)
- [ ] A full creator dashboard / `apps/web-admin` is deferred to post-MVP (TIMELINE Phase 8)

### Day 58 — Analytics & legal
- [ ] Product analytics (PostHog or Amplitude free tier): `signup`, `video_view` (3 s), `like`, `comment`, `follow`, `upload_started`, `upload_ready`, `share`
- [ ] Privacy policy and terms pages (hosted at `PUBLIC_WEB_URL`), linked from signup
- [ ] Account deletion: `DELETE /users/me` (cascades and deletes the Mux assets via the queue). This is required by the App Store.
- [ ] Optional: Expo push notifications for FOLLOW and COMMENT (a `PushToken` model and a send step in the notifications processor)

### Days 59–60 — Launch checklist
- [ ] Production env vars set and validated by the env schema at boot
- [ ] Sentry alerts: new issue → email; error rate > 2% for 5 min → email
- [ ] Uptime check on `/health` (Better Stack or UptimeRobot)
- [ ] Seed production with a few house-account videos so the first feed isn't empty
- [ ] Smoke test on production with the release build on real devices: signup, upload, feed, like, comment, follow, report, delete account
- [ ] Rollback plan written down: Railway redeploy of the previous image; migrations stay backward-compatible (expand → migrate → contract)
- [ ] Invite the first beta testers and set up a feedback channel

## Contracts
| Method | Path | Auth | Response |
|---|---|---|---|
| POST | `/videos/:id/report` | user | 204 |
| POST | `/comments/:id/report` | user | 204 |
| GET | `/admin/reports` | admin | `Paginated<ReportDto>` |
| POST | `/admin/videos/:id/hide` | admin | 204 |
| POST | `/admin/users/:id/ban` | admin | 204 |
| GET | `/users/me/stats` | user | `CreatorStats` |
| DELETE | `/users/me` | user | 204 |

## Done when
- [ ] A push to `main` deploys to staging, and a tag deploys to production, with no manual steps beyond approval
- [ ] Beta testers on both platforms can complete the core loop against production
- [ ] Reporting and hiding a video removes it from all feeds within one feed snapshot refresh
- [ ] Alerts fire on a forced test error

## Risks & notes
- **App review:** Apple requires account deletion, reporting and blocking of user-generated content (UGC), and a terms page. These are all included above; the block list is required for UGC apps, so don't skip it if submitting to the public App Store.
- Keep staging and production Mux and R2 resources strictly separate, so test uploads don't leak into production.
