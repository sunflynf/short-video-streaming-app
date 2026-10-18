# Project Structure and Suggested Tech Stack

> Stack options below are narrowed to concrete MVP choices in [docs/decisions.md](./docs/decisions.md); build steps live in [docs/plans/](./docs/plans/README.md).

This project is designed as a short-video social app inspired by TikTok, optimized for a solo developer MVP.

## Recommended Monorepo Layout

```text
short-video-streaming-app/
├── apps/
│   ├── mobile/
│   │   ├── app/
│   │   ├── src/
│   │   ├── components/
│   │   ├── screens/
│   │   ├── services/
│   │   ├── store/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web-admin/
│       ├── src/
│       ├── app/
│       ├── components/
│       └── package.json
│
├── packages/
│   └── shared/          # shared TS types / API DTOs (@app/shared)
│       ├── src/
│       └── package.json
│
├── backend/
│   ├── src/
│   │   ├── app.module.ts
│   │   ├── main.ts
│   │   ├── common/
│   │   │   ├── decorators/
│   │   │   ├── filters/
│   │   │   ├── guards/
│   │   │   ├── pipes/
│   │   │   └── utils/
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.controller.ts
│   │   │   └── strategies/
│   │   ├── users/
│   │   │   ├── users.module.ts
│   │   │   ├── users.service.ts
│   │   │   ├── users.controller.ts
│   │   │   └── dto/
│   │   ├── videos/
│   │   │   ├── videos.module.ts
│   │   │   ├── videos.service.ts
│   │   │   ├── videos.controller.ts
│   │   │   └── dto/
│   │   ├── feed/
│   │   │   ├── feed.module.ts
│   │   │   ├── feed.service.ts
│   │   │   └── feed.controller.ts
│   │   ├── likes/
│   │   │   ├── likes.module.ts
│   │   │   ├── likes.service.ts
│   │   │   └── likes.controller.ts
│   │   ├── comments/
│   │   │   ├── comments.module.ts
│   │   │   ├── comments.service.ts
│   │   │   └── comments.controller.ts
│   │   ├── follows/
│   │   │   ├── follows.module.ts
│   │   │   ├── follows.service.ts
│   │   │   └── follows.controller.ts
│   │   ├── notifications/
│   │   │   ├── notifications.module.ts
│   │   │   ├── notifications.service.ts
│   │   │   └── notifications.controller.ts
│   │   ├── uploads/
│   │   │   ├── uploads.module.ts
│   │   │   ├── uploads.service.ts
│   │   │   └── uploads.controller.ts
│   │   └── prisma/
│   │       ├── prisma.module.ts
│   │       └── prisma.service.ts
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   ├── nest-cli.json
│   └── docker-compose.yml
│
├── docs/
│   ├── decisions.md
│   ├── plans/
│   ├── architecture.md
│   ├── api.md
│   ├── media-pipeline.md
│   └── roadmap.md
│
├── README.md
├── TIMELINE.md
├── STRUCTURE.md
├── .gitignore
├── docker-compose.yml
├── package.json
└── pnpm-lock.yaml
```

## Backend Stack

### Primary Stack
- NestJS
- TypeScript
- PostgreSQL
- Prisma ORM
- Redis
- BullMQ
- Passport/JWT or Clerk integration

### Why this stack
- NestJS gives strong modular structure
- Prisma is fast for solo dev and schema management
- PostgreSQL is robust for social data
- Redis helps with cache and jobs
- BullMQ keeps upload/transcoding logic manageable

## Frontend / Mobile Stack

### For MVP
- React Native + Expo
- TypeScript
- Zustand or Redux Toolkit
- React Navigation
- Expo AV or a custom video player abstraction

### Why this stack
- Works well for both iOS and Android
- Fast to prototype and iterate
- Great for short-form vertical video feed UX

## Media / Streaming Stack

### Recommended MVP approach
- Use managed media platform: Mux or Cloudflare Stream
- Store original videos in Cloudflare R2 or S3
- Use HLS streaming URLs in the app

### Why
- Avoid building a custom media pipeline too early
- Faster to launch with reliable streaming and transcoding
- Better for solo developer focus and MVP speed

## Data Model Highlights

### Core Entities
- User
- Video
- Like
- Comment
- Follow
- Notification
- Playlist or collection (optional later)

### Key Relationships
- User has many videos
- User has many follows
- Video has many likes/comments
- Notification belongs to user

## Recommended MVP Modules

### Backend Modules
- auth
- users
- videos
- feed
- likes
- comments
- follows
- notifications
- uploads
- media (Mux provider + webhook processing; replaces a separate `streaming` module)
- admin (later)

### Mobile App Screens
- Onboarding
- Sign in / sign up
- Home feed
- Video player
- Upload form
- Create screen
- Profile screen
- Search screen
- Notifications screen

## Suggested API Endpoints

### Auth
- POST /auth/signup
- POST /auth/login
- POST /auth/refresh
- GET /auth/me

### Users
- GET /users/:id
- PATCH /users/:id
- GET /users/:id/videos

### Videos
- POST /videos/upload
- GET /videos/:id
- GET /videos/feed
- PATCH /videos/:id
- DELETE /videos/:id

### Social
- POST /videos/:id/like
- DELETE /videos/:id/like
- POST /videos/:id/comment
- GET /videos/:id/comments
- POST /users/:id/follow
- DELETE /users/:id/follow

### Notifications
- GET /notifications
- PATCH /notifications/:id/read

## Solo-Dev Best Practices

- Keep the first version server-render-light and API-driven
- Prefer managed services over self-hosted infrastructure
- Use one shared Postgres database for MVP
- Keep feed logic simple and deterministic
- Do not build a custom recommendation engine in v1
- Use worker queues for uploads and processing
- Validate file types and sizes carefully

## Suggested Deployment Strategy

### For MVP
- Backend: Railway or Fly.io
- DB: Railway Postgres or Supabase Postgres
- Redis: Upstash Redis
- Storage: Cloudflare R2 or AWS S3
- Web admin: Vercel
- Mobile: Expo EAS Build

### Why
- Fast deployment without large DevOps overhead
- Easier to manage for one developer
- Good balance between speed and reliability

## Recommended Development Order

1. Auth and user profiles
2. Prisma schema and DB migrations
3. Video upload + storage
4. Feed generation
5. Like/follow/comment APIs
6. Notifications
7. Mobile app UI and player
8. Test and deployment
9. Analytics and polish
10. Live streaming later

## Recommended Production Upgrade Path

After MVP:
- Add better recommendation engine
- Add live streaming real-time system
- Add advanced moderation tools
- Scale backend services
- Add creator monetization features
- Improve analytics and retention tracking

## Final Recommendation

For a solo developer MVP, the ideal stack is:
- NestJS + Prisma + PostgreSQL + Redis
- Expo + React Native
- Cloudflare R2/S3 storage
- Mux or Cloudflare Stream for video processing
- Clerk or Supabase Auth
- Vercel + Railway/Fly.io deployment

This setup gives a strong starting point while keeping complexity low.
