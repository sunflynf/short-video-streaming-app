# Phase 7 — MVP Launch Prep (Days 53–60)

**Status:** ✅ everything that can be built and checked without accounts is done: deploy config, release config, moderation, blocking, account deletion, stats, analytics, legal pages. ⏳ Steps that need Railway, Upstash, Mux, R2, Apple, Google, Sentry or PostHog accounts, or real devices, are written up as an ordered runbook in [`docs/launch.md`](../launch.md).

## Goal
Run staging and production environments, ship builds to beta testers (TestFlight / Play internal testing), and be able to see and act on problems.

## Scope
- **In:** deployment pipeline, environment config, migrations on deploy, a basic moderation hook, minimal creator stats, analytics events, a launch checklist.
- **Out:** public store launch marketing, the web admin app (post-MVP), monetization.

## Prerequisites
- Phase 6 done. Accounts: Railway, Upstash, Cloudflare (R2), Apple Developer, Google Play Console, Sentry.

## Tasks

### Days 53–54 — Backend deployment
- [x] `backend/Dockerfile` (multi-stage, `node:22-slim`, `prisma generate` at build time, non-root user, `HEALTHCHECK`). CI builds the image on every run (`image` job).
- [ ] Railway project with `staging` and `production` environments, each with its own Postgres. Upstash Redis per environment. ⏳ Needs accounts: `docs/launch.md` §1
- [x] Release command: `prisma migrate deploy` runs before the new version takes traffic (`preDeployCommand` in `backend/railway.json`; health-gated with `/v1/health`)
- [x] GitHub Actions (`.github/workflows/deploy.yml`): `main` → staging once CI passes; a tag `v*` → production (manual approval via environment protection). ⏳ Needs the `RAILWAY_TOKEN` secrets.
- [ ] Separate Mux environments and webhook endpoints for staging and production; separate R2 buckets. ⏳ `docs/launch.md` §1
- [ ] Daily Postgres backups enabled, with one restore tested on staging. ⏳ `docs/launch.md` §1

### Day 55 — Mobile release pipeline
- [x] `eas.json` profiles: `development`, `preview` (staging API, internal distribution), `production`
- [x] Bundle IDs, versioning (`appVersionSource: remote`, auto-increment), `ITSAppUsesNonExemptEncryption: false`. ⏳ Icons and splash are still the template art.
- [x] EAS Update channels that match the profiles, for JS-only hotfixes (`expo-updates`, `runtimeVersion.policy: appVersion`). ⏳ `updates.url` gets the project ID from `eas init`.
- [ ] Submit a `preview` build to TestFlight and Play internal testing. ⏳ `docs/launch.md` §5

### Day 56 — Moderation hook
- [x] `Report` model `{ id, reporterId, videoId?, commentId?, reason, details?, createdAt, resolvedAt?, resolvedById? }` + migration `moderation`
- [x] `POST /videos/:id/report` and `POST /comments/:id/report`; the mobile action is in the `…` menu on the video rail, and next to Reply on comments
- [x] Admin-only: `GET /admin/reports`, `POST /admin/videos/:id/hide` (sets `hidden=true`), `POST /admin/users/:id/ban` (add `bannedAt` to `User`; banned users get 403 on writes). Also `resolve`, `unhide`, `comments/:id/remove` and `unban`.
- [x] Auto-hide when a video gets ≥ 5 distinct reports, pending review
- [x] Block list: `Block` model, filtered out of feeds, profiles, comments and notifications in both directions (needed for App Store UGC review)

### Day 57 — Creator stats (minimal)
- [x] `GET /users/me/stats` returns totals (views, likes, comments, followers, videos) and the last 7 days of follower gains (derived from `Follow.createdAt`)
- [x] Per-video stats on the creator's own profile grid (view count overlay), plus a stats strip on your own profile
- [x] A full creator dashboard / `apps/web-admin` is deferred to post-MVP (TIMELINE Phase 8)

### Day 58 — Analytics & legal
- [x] Product analytics (PostHog): `signup`, `video_view` (3 s), `like`, `comment`, `follow`, `upload_started`, `upload_ready`, `share`. ⏳ Needs `EXPO_PUBLIC_POSTHOG_KEY`.
- [x] Privacy policy and terms pages (`/legal/terms`, `/legal/privacy` at `PUBLIC_WEB_URL`), linked from signup and Settings. ⏳ The text is a **draft template** for legal review.
- [x] Account deletion: `DELETE /users/me` (password confirmation; cascades and deletes the Mux assets via the queue). This is required by the App Store.
- [ ] Optional: Expo push notifications for FOLLOW and COMMENT (a `PushToken` model and a send step in the notifications processor). **Deferred:** in-app notifications cover the beta.

### Days 59–60 — Launch checklist
- [x] Production env vars validated by the env schema at boot: production refuses a dev or short JWT secret, an empty `CORS_ORIGINS`, a localhost `PUBLIC_WEB_URL` and an `@example.com` contact email. ⏳ Setting them: `docs/launch.md` §2
- [ ] Sentry alerts: new issue → email; error rate > 2% for 5 min → email. ⏳ `docs/launch.md` §6
- [ ] Uptime check on `/health` (Better Stack or UptimeRobot). ⏳ `docs/launch.md` §6
- [ ] Seed production with a few house-account videos so the first feed isn't empty. ⏳ `docs/launch.md` §4 (never the dev seed)
- [ ] Smoke test on production with the release build on real devices: signup, upload, feed, like, comment, follow, report, delete account. ⏳ Checklist in `docs/launch.md` §7; the same flows pass in the web smoke test.
- [x] Rollback plan written down: Railway redeploy of the previous image; migrations stay backward-compatible (expand → migrate → contract). See `docs/launch.md` → Rollback.
- [ ] Invite the first beta testers and set up a feedback channel. ⏳ `docs/launch.md` §8

## Contracts
| Method | Path | Auth | Response |
|---|---|---|---|
| POST | `/videos/:id/report` | user | 204 |
| POST | `/comments/:id/report` | user | 204 |
| GET | `/admin/reports` | admin | `Paginated<ReportGroupDto>` (open reports grouped by target) |
| POST | `/admin/reports/resolve` | admin | 204 (`{ videoId }` or `{ commentId }`) |
| POST | `/admin/videos/:id/hide`, `/unhide` | admin | 204 |
| POST | `/admin/comments/:id/remove` | admin | 204 |
| POST | `/admin/users/:id/ban`, `/unban` | admin | 204 |
| POST, DELETE | `/users/:id/block` | user | 204 |
| GET | `/users/me/blocks` | user | `Paginated<UserSummary>` |
| GET | `/legal/terms`, `/legal/privacy` | public | HTML |
| GET | `/users/me/stats` | user | `CreatorStats` |
| DELETE | `/users/me` | user | 204 (`{ password }`) |

Also new: `VideoDto.viewCount`, `UserProfile.blockedByMe`, `User.bannedAt`, `Block` model. New env: `LEGAL_CONTACT_EMAIL` (backend), `EXPO_PUBLIC_POSTHOG_KEY` / `EXPO_PUBLIC_POSTHOG_HOST` (mobile).

## Done when
- [ ] A push to `main` deploys to staging, and a tag deploys to production, with no manual steps beyond approval. ⏳ The workflow is in place; it needs the Railway projects and tokens.
- [ ] Beta testers on both platforms can complete the core loop against production. ⏳ Needs builds and devices.
- [x] Reporting and hiding a video removes it from all feeds within one feed snapshot refresh. In fact it's immediate, because each page re-checks `hidden` (`moderation.e2e-spec.ts`).
- [ ] Alerts fire on a forced test error. ⏳ Needs the Sentry project (`POST /admin/sentry-test`).

## Tests
- **Backend:** 111 e2e tests, including three new suites:
  - `moderation.e2e-spec.ts`: report idempotency, self-report → 400, auto-hide at 5 reporters removing the video from feeds, the admin list, resolve, hide/unhide, comment removal, and a ban → 403 on writes, login and refresh
  - `blocks.e2e-spec.ts`: follows removed both ways with correct counts; feeds, profile videos, single video, comments, likes and notifications filtered; following prevented; unblock
  - `account.e2e-spec.ts`: wrong password → 403; counters on other users and videos fixed; Mux deletes queued; content gone; login fails. Also stats and the legal pages.
- **Unit tests:** production env guards and the auto-hide threshold. Service coverage gate still ≥ 70% (`test:cov`).
- **Mobile:** 34 unit tests (the analytics client is new). The web smoke test now has **21 steps**: report a video via the `…` menu, creator stats, block a creator from their profile (and they disappear from the feed), log out from Settings, signup legal links, delete a throwaway account (wrong password first), and the deleted account can't log in.
- **Bundles:** `expo export` for iOS, Android and web with `expo-updates` installed. `eas.json` and the resolved `expo config` are checked.
- **Image:** Docker isn't available here, so the image was simulated with the same steps: a fresh `pnpm install --frozen-lockfile --filter backend...`, build, `pnpm deploy --prod --legacy`. Then `prisma migrate deploy` ran against an empty database, the app booted with `NODE_ENV=production`, and the `HEALTHCHECK` command passed. The CI `image` job runs the real `docker build`.

## Implementation notes (where the build differs from the original plan)
- **Bug found by the image simulation:** in a fresh build, `prisma generate` ran before `tsconfig.json` was copied in, so the generated client used `.ts` import extensions and the app crashed at boot (`ERR_MODULE_NOT_FOUND`). The generator now pins `moduleFormat = "esm"` and `importFileExtension = "js"`, so the output no longer depends on the build order.
- **`prisma` and `dotenv` are production dependencies**, so `migrate deploy` can run inside the image. This makes the image about 600 MB. Moving migrations to a separate job image would trim it if size ever matters.
- **`pnpm deploy` needs `--legacy`** with pnpm 10 workspaces that don't use injected dependencies.
- **One deploy token per GitHub Environment** (`RAILWAY_TOKEN`), rather than `RAILWAY_TOKEN_STAGING` and `RAILWAY_TOKEN_PRODUCTION`. The environment decides which token a job gets.
- **Blocks also stop likes** across the block, not only follows: liking a blocked user's video returns 404, like viewing it.
- **Menus are a cross-platform `ActionSheet`** (an RN `Modal`) rather than `Alert`, whose buttons do nothing on web. This made the moderation flows testable in the web smoke, and comment delete now works on web too.
- **Account deletion fixes counters in SQL** before the cascade (followers, following, likes, comments, replies). Otherwise the denormalized counts on other users and videos would drift.
- **Analytics has no SDK:** about 60 lines POSTing to PostHog's `/batch/` endpoint, identified by user ID only. It does nothing without a key.
- **Push notifications are deferred** (optional in this plan).

## Risks & notes
- **App review:** Apple requires account deletion, reporting and blocking of user-generated content (UGC), and a terms page. These are all included above; the block list is required for UGC apps, so don't skip it if submitting to the public App Store.
- Keep staging and production Mux and R2 resources strictly separate, so test uploads don't leak into production.
