# Roadmap

Per-phase work plans live in `docs/plans/` (Goal → Scope → Prerequisites → Tasks → Contracts → Done when → Tests → Risks).

| Phase | Plan | Days | Status |
|---|---|---|---|
| 0 | Planning & setup | 1–3 | ✅ |
| 1 | Core backend foundation | 4–12 | ✅ |
| 2 | Video upload & media pipeline | 13–20 | ✅ (real-Mux check pending keys) |
| 3 | Feed & discovery | 21–28 | ✅ |
| 4 | Social interactions | 29–35 | ✅ |
| 5 | Mobile app shell & video UI | 36–45 | ✅ (device QA pending) |
| 6 | Testing, hardening & polish | 46–52 | ✅ (device QA pending) |
| 7 | MVP launch prep | 53–60 | ✅ (account steps in the [Launch Runbook](Launch-Runbook)) |

```text
0 ─► 1 ─► 2 ─► 3 ─► 4 ─┐
     │                 ├─► 6 ─► 7
     └──────► 5 ───────┘
```

## Feature status

- ✅ Auth, profiles, upload, HLS streaming, feed with ranking, likes, follows, comments and replies, sharing, notifications, reporting/blocking/moderation, account deletion
- 🔄 Creator dashboard (minimal stats on your own profile)
- ⬜ Search and trending, recommendations

## After the MVP

Live streaming, duet/remix, creator monetization, an ML recommendation engine, creator analytics, push notifications, a web admin UI.
