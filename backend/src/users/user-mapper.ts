import type { MeProfile, UserProfile, UserSummary } from '@app/shared';
import type { Prisma } from '../generated/prisma/client.js';

export const userSummarySelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

export const userProfileSelect = {
  ...userSummarySelect,
  bio: true,
  followerCount: true,
  followingCount: true,
  createdAt: true,
  _count: { select: { videos: { where: { status: 'READY', hidden: false } } } },
} satisfies Prisma.UserSelect;

export const meProfileSelect = {
  ...userProfileSelect,
  email: true,
  role: true,
} satisfies Prisma.UserSelect;

type SummaryRow = Prisma.UserGetPayload<{ select: typeof userSummarySelect }>;
type ProfileRow = Prisma.UserGetPayload<{ select: typeof userProfileSelect }>;
type MeRow = Prisma.UserGetPayload<{ select: typeof meProfileSelect }>;

export function toUserSummary(row: SummaryRow): UserSummary {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
  };
}

export function toUserProfile(
  row: ProfileRow,
  isFollowing: boolean | null,
  blockedByMe: boolean | null = null,
): UserProfile {
  return {
    ...toUserSummary(row),
    bio: row.bio,
    followerCount: row.followerCount,
    followingCount: row.followingCount,
    videoCount: row._count.videos,
    isFollowing,
    blockedByMe,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toMeProfile(row: MeRow): MeProfile {
  return { ...toUserProfile(row, null), email: row.email, role: row.role };
}
