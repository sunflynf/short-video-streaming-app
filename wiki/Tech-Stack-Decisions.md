# Tech Stack Decisions

`README.md` and `STRUCTURE.md` list several options; this page records what the MVP actually uses. Full text: `docs/decisions.md`.

| # | Area | Decision | Why | Revisit when |
|---|---|---|---|---|
| D1 | Repo | pnpm workspaces monorepo | One repo and CI; shared types in `packages/shared` | Build times hurt (add Turborepo) or separate teams |
| D2 | Backend | NestJS 12 + TypeScript, Express adapter (ESM, Vitest) | Module layout fits the plan; widest middleware support (Mux raw body, multer) | HTTP overhead is the bottleneck |
| D3 | Database | PostgreSQL + Prisma 7 (`@prisma/adapter-pg`, URL in `backend/prisma.config.ts`) | Relational social data; fast migrations | Feed needs SQL Prisma can't express (use `$queryRaw`) |
| D4 | Auth | Passport JWT in NestJS | No vendor lock-in or per-MAU cost; users stay in our DB | Social login, magic links or MFA needed (compare with Clerk) |
| D5 | Video | Mux direct upload, transcoding, HLS, thumbnails | Removes the self-built pipeline | Mux cost grows (Cloudflare Stream via `MediaProvider`) |
| D6 | Object storage | Cloudflare R2, avatars only | No egress cost; Mux keeps video masters | Originals must be kept |
| D7 | Cache / jobs | Redis + BullMQ | Fast webhook acks, automatic retries | Not for the MVP |
| D8 | Mobile | Expo + Expo Router + `expo-video` | Native HLS, EAS builds, OTA updates | Custom native video features needed |
| D9 | Mobile state | Zustand + TanStack Query | Less boilerplate than Redux | — |
| D10 | Deployment | Railway + Upstash + EAS | Git-push deploys, managed backups | Cost or region changes (Fly.io) |
| D11 | Observability | Sentry + pino | Errors with request ids, structured logs | — |

## Auth details (D4)

- Access token 15 min; rotating refresh token 30 days, stored **hashed** in `RefreshToken` so it can be revoked. Reusing a refresh token revokes all of that user's sessions.
- Passwords hashed with `argon2`.
- Password reset uses a short-lived JWT signed with the secret plus the current password hash, so it is single-use without a token table.
