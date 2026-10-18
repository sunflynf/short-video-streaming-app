// Dev seed: 5 users (password "password123") with some follows. Safe to re-run.
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

  console.log(`Seeded ${users.length} users and ${follows.length} follows`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
