# Short Video Streaming App Wiki

A TikTok-style short-video social app built as a solo-developer MVP: vertical feed, uploads with adaptive HLS streaming, creator profiles, likes, comments, follows, notifications and moderation.

**Status:** MVP built (Phases 0–7). Launch steps that need accounts and devices are in the [Launch Runbook](Launch-Runbook).

## Pages

| Page | What's in it |
|---|---|
| [Architecture](Architecture) | Monorepo layout, backend modules, request flow, upload and feed pipelines |
| [Tech Stack Decisions](Tech-Stack-Decisions) | The concrete choices (D1–D11), why, and when to revisit |
| [Data Model](Data-Model) | Prisma models, enums and relationships |
| [API Reference](API-Reference) | Conventions and endpoint groups |
| [Security](Security) | Authorization, rate limits, moderation, validation, known gaps |
| [Local Development](Local-Development) | Prerequisites, setup, checks, environment variables |
| [Launch Runbook](Launch-Runbook) | Ordered steps for staging/production, mobile release, monitoring, rollback |
| [Roadmap](Roadmap) | Phases 0–7 and what comes after the MVP |

## Source of truth

These pages summarize the Markdown docs in the repository. If they disagree, the repo wins: `README.md`, `STRUCTURE.md`, `TIMELINE.md`, `docs/decisions.md`, `docs/security.md`, `docs/launch.md` and `docs/plans/`. The wiki source lives in the [`wiki/`](https://github.com/sunflynf/short-video-streaming-app/tree/main/wiki) folder; see its README for how to publish it.
