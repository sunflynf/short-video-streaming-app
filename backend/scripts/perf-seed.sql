-- Load-test data at the Phase 6 target scale. Run against a scratch database only:
--   createdb app_perf && DATABASE_URL=.../app_perf pnpm --filter backend exec prisma migrate deploy
--   psql .../app_perf -f backend/scripts/perf-seed.sql
-- 10k users, 50k READY videos, 500k likes, 100k follows, 150k comments, 200k notifications.
-- Every user's password is "password123" (argon2 hash of the seed user).
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO "User" (id, email, username, "passwordHash", "displayName", "updatedAt")
SELECT 'pu' || g, 'perf' || g || '@example.com', 'perf' || g,
       '$argon2id$v=19$m=65536,p=4,t=3$HOdAjbOFQ0S7V9q8hrmcmw$xRr0ywUA+QJ2oDggVaX3dYRHghsjfYtsU3nhdHx3xIw',
       'Perf ' || g, now()
FROM generate_series(1, 10000) g;

INSERT INTO "Video" (id, "authorId", caption, status, "muxPlaybackId", "durationSec", "aspectRatio",
                     "commentCount", "shareCount", "viewCount", hidden, "publishedAt", "updatedAt")
SELECT 'pv' || g, 'pu' || (1 + (g * 7919) % 10000), 'perf clip ' || g, 'READY', 'perf_pb_' || g, 15, '9:16',
       0, (random() ^ 4 * 50)::int, (random() ^ 3 * 10000)::int, random() < 0.01,
       now() - random() * interval '30 days', now()
FROM generate_series(1, 50000) g;

-- Likes skewed toward a minority of videos, like real engagement.
INSERT INTO "Like" ("userId", "videoId", "createdAt")
SELECT DISTINCT ON (u, v) 'pu' || u, 'pv' || v, now() - random() * interval '30 days'
FROM (
  SELECT 1 + (random() * 9999)::int AS u, 1 + ((random() ^ 3) * 49999)::int AS v
  FROM generate_series(1, 560000)
) pairs
LIMIT 500000;

INSERT INTO "Follow" ("followerId", "followingId", "createdAt")
SELECT DISTINCT ON (a, b) 'pu' || a, 'pu' || b, now() - random() * interval '60 days'
FROM (
  SELECT 1 + (random() * 9999)::int AS a, 1 + ((random() ^ 2) * 9999)::int AS b
  FROM generate_series(1, 110000)
) pairs
WHERE a <> b
LIMIT 100000;

INSERT INTO "Comment" (id, "videoId", "authorId", body, "createdAt")
SELECT 'pc' || g, 'pv' || (1 + ((random() ^ 3) * 49999)::int), 'pu' || (1 + (random() * 9999)::int),
       'perf comment ' || g, now() - random() * interval '30 days'
FROM generate_series(1, 150000) g;

INSERT INTO "Notification" (id, "recipientId", "actorId", type, "videoId", "createdAt", "readAt")
SELECT 'pn' || g, 'pu' || (1 + ((random() ^ 2) * 9999)::int), 'pu' || (1 + (random() * 9999)::int),
       (ARRAY['LIKE', 'COMMENT', 'FOLLOW']::"NotificationType"[])[1 + (g % 3)],
       CASE WHEN g % 3 = 2 THEN NULL ELSE 'pv' || (1 + (g % 50000)) END,
       now() - random() * interval '30 days',
       CASE WHEN random() < 0.7 THEN now() END
FROM generate_series(1, 200000) g;

-- Denormalised counters, as the app keeps them.
UPDATE "Video" v SET "likeCount" = c.n FROM (SELECT "videoId", count(*) n FROM "Like" GROUP BY 1) c WHERE c."videoId" = v.id;
UPDATE "Video" v SET "commentCount" = c.n FROM (SELECT "videoId", count(*) n FROM "Comment" GROUP BY 1) c WHERE c."videoId" = v.id;
UPDATE "User" u SET "followerCount" = c.n FROM (SELECT "followingId" id, count(*) n FROM "Follow" GROUP BY 1) c WHERE c.id = u.id;
UPDATE "User" u SET "followingCount" = c.n FROM (SELECT "followerId" id, count(*) n FROM "Follow" GROUP BY 1) c WHERE c.id = u.id;

COMMIT;
ANALYZE "User", "Video", "Like", "Follow", "Comment", "Notification";
