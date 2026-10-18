# Short Video Streaming App

A TikTok-style short video social app focused on:
- short-form video discovery
- vertical video playback
- creator profiles and follow system
- likes, comments, shares
- fast content ingestion and streaming
- personalized feed

This project is intended as an MVP blueprint for building a short-form video platform with modern mobile and backend stack.

## Product Idea

A mobile-first platform where users can:
- upload short videos (15s–60s)
- watch a personalized feed
- like/comment/share content
- follow creators
- discover trending topics
- interact with other users

The app should support:
- low-latency playback
- adaptive bitrate streaming
- fast content ingestion
- global content delivery
- engagement metrics for creators

## Core Goals

1. Create a smooth short-video experience
2. Support scalable content upload and delivery
3. Deliver personalized feeds using engagement signals
4. Build creator-focused features
5. Make the platform extensible for future live-streaming features

## Target User Experience

- Open the app and see a vertical feed
- Swipe between short videos
- like, comment, or follow quickly
- upload a short clip in a few taps
- get personalized recommendations

## MVP Features (Phase 1 & 2)

### Phase 1: Foundation (Weeks 1-4)
- User authentication (sign up, login, password reset)
- Basic user profile
- Upload short video clips
- Video transcoding to HLS
- Watch feed with vertical swipe
- Like/unlike videos
- Follow/unfollow creators

### Phase 2: Social (Weeks 5-8)
- Comments and replies
- Share videos
- Creator dashboard with stats
- Search and trending section
- User notifications
- Feed ranking algorithm

## Suggested Tech Stack

### Frontend / Mobile
- React Native + Expo
- TypeScript
- Redux or Zustand for state management

### Backend
- NestJS + TypeScript
- Fastify as HTTP framework (optional)
- Prisma ORM
- PostgreSQL

### Authentication
- Clerk or Supabase Auth

### Database
- PostgreSQL for relational data
- Redis for caching and rate limiting

### Media & Streaming
- Mux or Cloudflare Stream for transcoding and adaptive streaming
- Cloudflare R2 or AWS S3 for storage

> The MVP locks in specific choices from the options above (JWT auth in NestJS, Mux, R2 for avatars, Zustand + TanStack Query). See [docs/decisions.md](./docs/decisions.md).

### Real-Time
- Socket.IO for real-time interactions (likes, comments, presence)
- Supabase Realtime (optional)

### Background Jobs
- Redis + BullMQ for async video processing and notifications

### Deployment
- Vercel for web dashboard
- Railway or Fly.io for backend
- Managed PostgreSQL (Railway, Supabase)
- Managed Redis (Upstash)

## Project Timeline

See [TIMELINE.md](./TIMELINE.md) for detailed development phases and [docs/plans/](./docs/plans/README.md) for the actionable per-phase work plans.

## Architecture

See [STRUCTURE.md](./STRUCTURE.md) for detailed architecture and folder structure. Security posture (authorization table, limits, audit): [docs/security.md](./docs/security.md).

## Getting Started

### Prerequisites
- Node.js 22 (see `.nvmrc`)
- pnpm 10 (`corepack enable` picks up the pinned version)
- Docker (runs local PostgreSQL + Redis)

### Installation

```bash
git clone https://github.com/sunflynf/short-video-streaming-app.git
cd short-video-streaming-app

# Local Postgres + Redis
docker compose up -d

# Install all workspaces (pnpm monorepo)
pnpm install

# Backend
cp backend/.env.example backend/.env
pnpm --filter backend exec prisma migrate dev
pnpm --filter backend prisma:seed   # 5 demo users, password "password123"

# Mobile
cp apps/mobile/.env.example apps/mobile/.env

# Run API + Expo together
pnpm dev

# API health check
curl http://localhost:3000/v1/health
# API docs: http://localhost:3000/docs

# Checks (backend e2e uses a separate <db>_test database and Redis db 1)
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter backend test:e2e
pnpm --filter backend test:cov   # unit + e2e with the 70% service coverage gate (as CI runs it)
```

### Environment Variables

See `backend/.env.example` and `apps/mobile/.env.example`. Each phase plan lists the variables it introduces. The `MUX_*` keys are optional; without them the API runs, but video uploads return 503. To test real uploads, see [Run it against real Mux](./docs/plans/phase-2-media.md#run-it-against-real-mux).

## Features by Phase

Legend: ⬜ planned · 🔄 in progress · ✅ done

### Phase 1: MVP Foundation
- ⬜ User management and auth
- ⬜ Video upload API
- ⬜ Video streaming (HLS)
- ⬜ Feed with basic ranking
- ⬜ Like/unlike
- ⬜ Follow/unfollow
- ⬜ Basic mobile app UI

### Phase 2: Social Features
- ⬜ Comments and replies
- ⬜ Share functionality
- ⬜ User notifications
- ⬜ Creator dashboard
- ⬜ Search and trending
- ⬜ Video recommendations

### Phase 3: Advanced Features
- ⬜ Live streaming
- ⬜ Duet/remix features
- ⬜ Creator monetization
- ⬜ Advanced recommendation engine (ML)
- ⬜ Creator tools and analytics

## Deployment

### Backend
- Deploy to Railway or Fly.io
- Use managed PostgreSQL
- Use Upstash for Redis

### Mobile
- Build APK/IPA with EAS Build (Expo)
- Deploy to Google Play and App Store

### Web Dashboard
- Deploy to Vercel

## Contributing

Solo development for MVP phase. Open to contributions after MVP launch.

## License

MIT

## Notes

This repository is designed for solo developer MVP speed. It prioritizes:
- Fast initial development
- Managed services over self-hosted infrastructure
- Simple architecture over premature scaling
- Working product over perfect code

Next steps after MVP:
- User testing and feedback
- Performance optimization
- Content moderation system
- Creator monetization

---

**Status:** Phase 1 - Foundation (in development)

**Last Updated:** 2026-10-10
