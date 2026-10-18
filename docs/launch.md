# Launch Runbook

This is the ordered list of steps that need real accounts. Everything in the repo is ready for them: the Docker image, `railway.json`, the deploy workflow, `eas.json`, and the production env checks. Work top to bottom. Each step says **who** does it, **how**, and what **done** looks like.

Placeholders to replace as you go:

| Placeholder | Where | Replace with |
|---|---|---|
| `api-staging.example.com`, `api.example.com` | `apps/mobile/eas.json` | Your staging and production API domains |
| `REPLACE_WITH_EAS_PROJECT_ID` | `apps/mobile/app.json` (`updates.url`) | Written by `eas init` (step 5) |
| `REPLACE_WITH_APP_STORE_CONNECT_APP_ID` | `apps/mobile/eas.json` (`submit`) | The App Store Connect app ID |
| `app.shortvid.mobile` | `apps/mobile/app.json` | Your bundle ID / package name, if different. It can't change after the first store upload. |
| `support@example.com` | `LEGAL_CONTACT_EMAIL` | A monitored inbox. Production refuses to boot with an `@example.com` address. |
| Legal page text | `backend/src/legal/legal-pages.ts` | Text reviewed by a lawyer. The current pages are a **draft template**. |

## 1. Backend services (owner: backend)

For each of **staging** and **production**:

1. **Railway:**
   - Create one project with two environments, `staging` and `production`.
   - In each environment, add a **Postgres** plugin and a service named **`api`** linked to this GitHub repo, with **root directory `/`** and **config file `backend/railway.json`**.
   - The service builds `backend/Dockerfile`. `preDeployCommand` runs `prisma migrate deploy` before the new version takes traffic, and the deploy only goes live once `/v1/health` returns 200.
2. **Postgres backups:**
   - Turn on daily backups (Railway → Postgres → Backups).
   - **Restore drill on staging:** restore the latest backup into a new database, point a copy of the API at it, and check `/v1/health` and one profile page. Write down how long it took.
3. **Redis:**
   - Create one Upstash Redis database per environment, in the same region as Railway.
   - Use the `rediss://` URL.
   - Turn on eviction protection: BullMQ jobs must not be evicted.
4. **Mux:**
   - Create one Mux **environment** per app environment, each with its own access token.
   - Add a webhook to `https://<api domain>/v1/webhooks/mux` and copy its signing secret.
   - Staging uploads must never reach the production environment.
5. **Cloudflare R2:**
   - Create one bucket per environment, with public access through an `r2.dev` URL or a custom domain.
   - Create an API token scoped to that bucket only (Object Read & Write).
   - Add a CORS rule allowing `PUT` from any origin. Native apps don't send `Origin`, and the web build needs this rule.

**Done:** both environments deploy, migrate and return a healthy `/v1/health` with `database`, `redis` and every queue up.

## 2. Secrets (owner: backend)

Set these on the Railway `api` service in each environment. `validateEnv` checks them at boot, and with `NODE_ENV=production` it **refuses to start** when:
- `JWT_ACCESS_SECRET` contains `dev-only` or is shorter than 48 characters
- `CORS_ORIGINS` is empty
- `PUBLIC_WEB_URL` points at localhost
- `LEGAL_CONTACT_EMAIL` is still an `@example.com` address

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` (already set in the image) |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Railway reference) |
| `REDIS_URL` | Upstash `rediss://…` URL |
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48`, different for each environment |
| `TRUST_PROXY` | `1` |
| `CORS_ORIGINS` | The web origin(s) allowed to call the API, comma-separated |
| `PUBLIC_WEB_URL` | `https://<api domain>` (share links and legal pages) |
| `LEGAL_CONTACT_EMAIL` | The support inbox |
| `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_WEBHOOK_SECRET` | From step 1.4 |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | From step 1.5 |
| `SENTRY_DSN` | Backend Sentry project DSN. The release defaults to Railway's commit SHA. |
| `LOG_LEVEL` | `info` |

Leave the rate-limit, feed and upload-limit variables at their defaults unless you have a reason to change them.

**Done:** a deploy with each variable removed in turn fails at boot with a clear message, and the API boots with the full set. You only need to try this on staging.

## 3. GitHub (owner: repo admin)

1. Create the GitHub **Environments** `staging` and `production`. Give `production` **required reviewers**, which is the manual approval step for tagged releases.
2. Create a Railway **project token** for each environment and add it as the `RAILWAY_TOKEN` secret on the matching GitHub Environment.
3. Check the deploy triggers:
   - Merging to `main` runs CI, and once CI passes, `.github/workflows/deploy.yml` deploys to staging.
   - `git tag v0.1.0 && git push origin v0.1.0` waits for approval, then deploys to production.

**Done:** a merge to `main` shows up on staging without manual steps, and a tag deploys to production after approval.

## 4. First admin and house content (owner: backend)

1. Sign up the moderator accounts in the app.
2. Promote each one in the production database (Railway → Postgres → Query):
   ```sql
   UPDATE "User" SET role = 'ADMIN' WHERE email = 'moderator@yourdomain.com';
   ```
   The new role takes effect at the next token refresh (within 15 minutes) or after logging in again.
3. **House videos:**
   - Sign up two or three house accounts.
   - Post 10–20 clips so the first feed isn't empty, either from the app or with:
     ```bash
     API_URL=https://<api domain>/v1 SAMPLE_EMAIL=house@yourdomain.com SAMPLE_PASSWORD=… \
       pnpm --filter backend upload:sample ./clip.mp4 "Caption"
     ```
   - **Never run `prisma:seed` in production.** It creates demo users with a known password and an admin.

**Done:** a new account's For You feed has videos, and `GET /v1/admin/reports` works for the moderator.

## 5. Mobile release (owner: mobile)

Run these from `apps/mobile`, with the Expo account that owns the app:

1. `npx eas-cli@latest init`: links the project and writes `extra.eas.projectId`. Put the same ID into `updates.url` in `app.json`.
2. Replace the API domains in `eas.json`.
3. **App art:** replace the template icon, adaptive icon and splash images in `assets/images/`. Keep the file names, or update `app.json`.
4. **Sentry source maps:** run `eas env:create` for `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT`, and `EXPO_PUBLIC_SENTRY_DSN` per environment.
5. **Analytics (optional):** set `EXPO_PUBLIC_POSTHOG_KEY` (and `EXPO_PUBLIC_POSTHOG_HOST` for the EU cloud). Without it, the analytics calls do nothing.
6. **Credentials:** `npx eas-cli credentials`. Let EAS manage the iOS certificates and the Android keystore, and back up the keystore.
7. **Build:**
   ```bash
   npx eas-cli build -p all --profile preview
   ```
   This makes internal builds against staging. Install them on one iPhone and one Android phone.
8. **Submit:**
   ```bash
   npx eas-cli build -p all --profile production
   npx eas-cli submit -p ios --latest       # → TestFlight
   npx eas-cli submit -p android --latest   # → Play internal testing (needs play-service-account.json, git-ignored)
   ```
   - **App Store Connect:** fill in the privacy questionnaire (email, user content, usage data, crash data), the Terms and Privacy URLs (`/legal/terms`, `/legal/privacy`), a demo account for review, and the UGC notes: reporting, blocking, and deletion in Settings.
   - **Play Console:** fill in the data safety form, the content rating, and a test account.
9. **Hotfixes:** for JS-only fixes, run `npx eas-cli update --channel production -m "…"`. Builds only pick up updates for the same `version`, because of `runtimeVersion.policy: appVersion`. Native changes need a new build and a version bump.

**Done:** TestFlight and Play internal testing each have a build that signs up against production.

## 6. Monitoring (owner: backend)

1. **Sentry alert rules** for both the backend and mobile projects:
   - a new issue → email the team
   - more than 2% of events are errors over 5 minutes → email
2. **Force a test error:** as an admin, call `POST /v1/admin/sentry-test`. The event should arrive with the `requestId` tag and the release SHA, and the alert email should fire.
3. **Uptime:** add a Better Stack or UptimeRobot check on `https://<api domain>/v1/health` every minute, alerting after 2 failures. Health returns 503 when the database or Redis is down.
4. **Queues:** `GET /v1/admin/queues` (admin) shows waiting and failed jobs. A growing `failed` count means Mux or the notifications worker needs attention.

**Done:** the forced error is in Sentry and the alert email arrived; the uptime monitor is green.

## 7. Release-day smoke test (owner: QA; production build on real devices)

Use one iPhone and one Android phone, with two test accounts A and B.

- [ ] Sign up as A (the legal links open), log out, then log in again
- [ ] The feed plays immediately; swiping 10 clips doesn't stutter and only one clip has audio at a time
- [ ] Upload a clip from the gallery → it's processed → it's on A's profile, and the grid shows views
- [ ] As B: like, comment on and follow A; A's inbox shows all three
- [ ] B reports A's video (… → Report video → reason); a moderator sees it in `GET /v1/admin/reports`
- [ ] B reports one of A's comments from the comments sheet. On iOS, check that the menu opens on top of the sheet.
- [ ] B blocks A: A's videos disappear from B's feeds, and A's profile offers Unblock
- [ ] A deletes their account (Settings → Delete account): they're signed out, login fails, and B's follower and like counts drop accordingly
- [ ] Share link `https://<api domain>/v/<id>` opens the share page
- [ ] Also run the Phase 5 device QA checklist (`docs/plans/phase-5-mobile.md`) once on a low-end Android phone

## 8. Beta (owner: product)

1. Invite the first testers: TestFlight external group (needs a short Beta App Review) and a Play internal testing list.
2. Set up a feedback channel (a form or a chat channel), and put its link in the TestFlight "What to Test" notes.
3. Check reports daily: `GET /v1/admin/reports`, then resolve, hide or ban.

## Rollback

- **API:**
  - Railway → `api` → Deployments → **Redeploy** the previous deployment.
  - That redeploys the previous image as is. Its `preDeployCommand` runs `migrate deploy` again, which does nothing once migrations are applied.
- **Migrations are expand → migrate → contract:**
  - A release only *adds* columns or tables, or makes them optional, so the previous image keeps working on the new schema.
  - Dropping or renaming happens in a later release, once nothing reads the old shape.
  - Never edit an applied migration.
- **Mobile:**
  - Republish the previous update with `eas update:republish --channel production`.
  - A broken native build is pulled from TestFlight or Play, and testers reinstall the previous one.
- **Data:** restore the daily Postgres backup (practised in step 1.2). This is a last resort, because it loses everything written since the backup.

## Deferred

- **Push notifications** (Expo push for FOLLOW and COMMENT): not built for the MVP. In-app notifications and the unread badge cover beta needs. Adding it means a `PushToken` model, a registration call at login, and a send step in the notifications processor.
- **A web admin UI for reports:** admins use the JSON endpoints for now.
