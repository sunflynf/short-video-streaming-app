# Work Plans

These are actionable plans for building the MVP. There's one file per phase from [`TIMELINE.md`](../../TIMELINE.md). Stack choices are fixed in [`docs/decisions.md`](../decisions.md).

| Phase | Plan | Days | Depends on |
|-------|------|------|------------|
| 0 | [Planning & setup](./phase-0-setup.md) ✅ | 1–3 | — |
| 1 | [Core backend foundation](./phase-1-backend-core.md) ✅ | 4–12 | 0 |
| 2 | [Video upload & media pipeline](./phase-2-media.md) ✅ (real-Mux check pending keys) | 13–20 | 1 |
| 3 | [Feed & discovery](./phase-3-feed.md) ✅ | 21–28 | 2 |
| 4 | [Social interactions](./phase-4-social.md) ✅ | 29–35 | 3 |
| 5 | [Mobile app shell & video UI](./phase-5-mobile.md) | 36–45 | 1 (auth), 2–4 (APIs) |
| 6 | [Testing, hardening & polish](./phase-6-hardening.md) | 46–52 | 1–5 |
| 7 | [MVP launch prep](./phase-7-launch.md) | 53–60 | 6 |

```text
0 ─► 1 ─► 2 ─► 3 ─► 4 ─┐
     │                 ├─► 6 ─► 7
     └──────► 5 ───────┘
```

Phase 5 can begin early. The auth screens and the app shell only need Phase 1, so mobile work can run alongside Phases 2–4 if that's useful.

## How to use these plans

- Each plan follows the same template: **Goal → Scope → Prerequisites → Tasks → Contracts → Done when → Tests → Risks**.
- Tasks are `- [ ]` checkboxes. Tick them in the PR that completes them, so the plan doubles as a progress tracker.
- Each task group is sized for about one day. A group that takes more than two days should be split, with a note added to the plan.
- **Contracts** sections (Prisma models, endpoints, env vars) are the source of truth. If the implementation changes a contract, update the plan in the same PR.
- All endpoints are served under `/v1` (for example `POST /v1/auth/signup`). Paths in the plans leave out the prefix.
- Shared request and response types live in `packages/shared/src/api/*.ts` and are imported by both `backend` and `apps/mobile`.

## Conventions used across phases

- **Pagination:** cursor-based. Lists return `{ items: T[], nextCursor: string | null }`, and the client passes `?cursor=&limit=` (default 10, max 50).
- **Errors:** `{ statusCode, error, message, requestId }`, produced by a global exception filter (Phase 1, hardened in Phase 6).
- **IDs:** `cuid()` strings.
- **Time:** stored as UTC `DateTime` and serialised as ISO 8601.
- **Auth header:** `Authorization: Bearer <accessToken>`. Endpoints are authenticated by default; public endpoints opt out with `@Public()`.
