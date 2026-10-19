# Launch Runbook

Condensed from `docs/launch.md` (the repo file has the full detail and placeholder table). Work top to bottom; each step ends with a "done" check.

1. **Backend services** (per environment, `staging` and `production`)
   - Railway project with a Postgres plugin and an `api` service (root `/`, config `backend/railway.json`). `prisma migrate deploy` runs before traffic; deploy goes live when `/v1/health` is 200.
   - Daily Postgres backups plus a restore drill on staging.
   - One Upstash Redis per environment (`rediss://`, eviction protection on).
   - One Mux environment per app environment, webhook to `https://<api>/v1/webhooks/mux`.
   - One R2 bucket per environment, bucket-scoped token, CORS allowing `PUT`.
2. <a id="2-secrets"></a>**Secrets** on the Railway service. In production `validateEnv` refuses to boot if `JWT_ACCESS_SECRET` contains `dev-only` or is under 48 chars, `CORS_ORIGINS` is empty, `PUBLIC_WEB_URL` is localhost, or `LEGAL_CONTACT_EMAIL` is `@example.com`. Set `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `TRUST_PROXY=1`, `CORS_ORIGINS`, `PUBLIC_WEB_URL`, `LEGAL_CONTACT_EMAIL`, `MUX_*`, `R2_*`, `SENTRY_DSN`, `LOG_LEVEL=info`.
3. **GitHub:** Environments `staging` and `production` (required reviewers on production), `RAILWAY_TOKEN` per environment. Merge to `main` → staging; `v*` tag → production after approval.
4. **First admin and content:** promote moderators with `UPDATE "User" SET role = 'ADMIN' ...`; seed 10–20 house videos (`pnpm --filter backend upload:sample`). Never run `prisma:seed` in production.
5. **Mobile release** (from `apps/mobile`): `eas init`, set API domains in `eas.json`, replace app art, configure Sentry/PostHog env, `eas credentials`, `eas build --profile preview`, then production build and `eas submit` to TestFlight / Play internal. Fill in store privacy forms and UGC notes. JS-only hotfixes: `eas update --channel production`.
6. **Monitoring:** Sentry alert rules, forced test error via `POST /v1/admin/sentry-test`, uptime check on `/v1/health`, queue check via `GET /v1/admin/queues`.
7. **Release-day smoke test** on one iPhone and one Android phone with two accounts: signup/login, feed playback, upload, like/comment/follow, report, block, account deletion, share link.
8. **Beta:** TestFlight external group + Play internal list, a feedback channel, daily check of `GET /v1/admin/reports`.

## Rollback

- **API:** Railway → Deployments → redeploy the previous deployment. Migrations are expand → migrate → contract, so the old image works on the new schema.
- **Mobile:** `eas update:republish --channel production`; pull a broken native build from TestFlight/Play.
- **Data:** restore the daily backup (last resort; loses writes since the backup).

## Deferred

Expo push notifications (needs a `PushToken` model, registration at login, a send step in the notifications processor) and a web admin UI for reports.
