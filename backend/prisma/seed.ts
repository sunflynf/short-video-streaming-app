// Dev seed: 5 users (password "password123") with some follows. Safe to re-run.
// Set SEED_MUX_PLAYBACK_IDS (comma-separated public playback ids from your Mux account)
// to also create READY videos for feed work without uploading.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const users = [
  { username: 'alice', displayName: 'Alice', bio: 'Dance clips and city walks' },
  { username: 'bob', displayName: 'Bob', bio: 'Cooking in 60 seconds' },
  { username: 'carol', displayName: 'Carol', bio: 'Skate park daily' },
  { username: 'dave', displayName: 'Dave', bio: null },
  { username: 'erin', displayName: 'Erin', bio: 'Admin account', role: 'ADMIN' as const },
];

// [follower, following]
const follows: [string, string][] = [
  ['bob', 'alice'],
  ['carol', 'alice'],
  ['dave', 'alice'],
  ['erin', 'alice'],
  ['alice', 'bob'],
  ['carol', 'bob'],
  ['dave', 'carol'],
];

async function main(): Promise<void> {
  const passwordHash = await argon2.hash('password123');
  const ids = new Map<string, string>();
  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: { ...u, email: `${u.username}@example.com`, passwordHash },
    });
    ids.set(u.username, user.id);
  }

  await prisma.follow.createMany({
    data: follows.map(([follower, following]) => ({
      followerId: ids.get(follower)!,
      followingId: ids.get(following)!,
    })),
    skipDuplicates: true,
  });

  // Recompute the denormalized counters from the rows so re-runs stay consistent.
  await prisma.$executeRaw`
    UPDATE "User" u SET
      "followerCount"  = (SELECT count(*) FROM "Follow" f WHERE f."followingId" = u.id),
      "followingCount" = (SELECT count(*) FROM "Follow" f WHERE f."followerId" = u.id)`;

  const playbackIds = (process.env.SEED_MUX_PLAYBACK_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const authors = [...ids.values()];
  let videos = 0;
  for (const [i, playbackId] of playbackIds.entries()) {
    const existing = await prisma.video.findFirst({ where: { muxPlaybackId: playbackId } });
    if (existing) continue;
    await prisma.video.create({
      data: {
        authorId: authors[i % authors.length]!,
        caption: `Seed clip ${i + 1}`,
        status: 'READY',
        muxPlaybackId: playbackId,
        durationSec: 15,
        aspectRatio: '9:16',
        // Spread publish times over the last two weeks so feed ranking has something to sort.
        publishedAt: new Date(Date.now() - i * 6 * 60 * 60 * 1000),
      },
    });
    videos += 1;
  }

  const loadVideos = await seedLoadTestVideos(authors);

  console.log(
    `Seeded ${users.length} users, ${follows.length} follows and ${videos + loadVideos} new videos` +
      (playbackIds.length || loadVideos ? '' : ' (set SEED_MUX_PLAYBACK_IDS to add videos)'),
  );
}

/**
 * `pnpm prisma:seed -- --videos 10000` adds READY "load-test" videos with random engagement
 * spread over 30 days, for EXPLAIN ANALYZE and latency checks. Their playback ids are fake.
 * Remove them with: DELETE FROM "Video" WHERE caption = 'load-test';
 */
async function seedLoadTestVideos(authors: string[]): Promise<number> {
  const flag = process.argv.indexOf('--videos');
  const count = flag >= 0 ? Number(process.argv[flag + 1]) : 0;
  if (!Number.isInteger(count) || count <= 0) return 0;
  const DAY_MS = 24 * 60 * 60 * 1000;
  for (let done = 0; done < count; done += 1000) {
    const batch = Math.min(1000, count - done);
    await prisma.video.createMany({
      data: Array.from({ length: batch }, (_, i) => ({
        authorId: authors[(done + i) % authors.length]!,
        caption: 'load-test',
        status: 'READY' as const,
        muxPlaybackId: `load_${done + i}`,
        durationSec: 15,
        likeCount: Math.floor(Math.random() ** 3 * 5000),
        commentCount: Math.floor(Math.random() ** 3 * 500),
        shareCount: Math.floor(Math.random() ** 3 * 200),
        hidden: Math.random() < 0.01,
        publishedAt: new Date(Date.now() - Math.random() * 30 * DAY_MS),
      })),
    });
  }
  return count;
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
