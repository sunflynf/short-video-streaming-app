import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreatorStats } from '@app/shared';
import * as argon2 from 'argon2';
import { MediaQueue } from '../media/media.queue.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaQueue: MediaQueue,
  ) {}

  /**
   * Permanently deletes the account and everything it owns (App Store requirement).
   * Counters on other people's videos and profiles are corrected first, the cascade removes
   * the rest, and the Mux assets are deleted through the queue (with retries).
   * Replies by others to this user's comments go too: without the parent they lose context.
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!(await argon2.verify(user.passwordHash, password))) {
      throw new ForbiddenException('Incorrect password');
    }

    const videos = await this.prisma.video.findMany({
      where: { authorId: userId },
      select: { muxAssetId: true, muxUploadId: true, status: true },
    });

    await this.prisma.$transaction(async (tx) => {
      // Follow counts of the people this user followed / was followed by.
      await tx.$executeRaw`
        UPDATE "User" SET "followerCount" = "followerCount" - 1
        WHERE id IN (SELECT "followingId" FROM "Follow" WHERE "followerId" = ${userId})`;
      await tx.$executeRaw`
        UPDATE "User" SET "followingCount" = "followingCount" - 1
        WHERE id IN (SELECT "followerId" FROM "Follow" WHERE "followingId" = ${userId})`;

      // Likes this user left on other people's videos.
      await tx.$executeRaw`
        UPDATE "Video" SET "likeCount" = "likeCount" - 1
        WHERE "authorId" <> ${userId}
          AND id IN (SELECT "videoId" FROM "Like" WHERE "userId" = ${userId})`;

      // Comments that disappear: this user's, plus replies to this user's top-level comments.
      await tx.$executeRaw`
        WITH gone AS (
          SELECT c.id, c."videoId", c."parentId", c."deletedAt"
          FROM "Comment" c
          LEFT JOIN "Comment" p ON p.id = c."parentId"
          WHERE c."authorId" = ${userId} OR p."authorId" = ${userId}
        )
        UPDATE "Video" v SET "commentCount" = v."commentCount" - g.n
        FROM (SELECT "videoId", count(*) AS n FROM gone WHERE "deletedAt" IS NULL GROUP BY "videoId") g
        WHERE v.id = g."videoId" AND v."authorId" <> ${userId}`;
      // This user's replies under other people's comments.
      await tx.$executeRaw`
        UPDATE "Comment" p SET "replyCount" = p."replyCount" - r.n
        FROM (
          SELECT "parentId", count(*) AS n FROM "Comment"
          WHERE "authorId" = ${userId} AND "parentId" IS NOT NULL AND "deletedAt" IS NULL
          GROUP BY "parentId"
        ) r
        WHERE p.id = r."parentId" AND p."authorId" <> ${userId}`;

      await tx.comment.deleteMany({ where: { parent: { authorId: userId } } });
      await tx.user.delete({ where: { id: userId } });
    });

    for (const video of videos) {
      if (video.muxAssetId) await this.mediaQueue.enqueueDeleteAsset(video.muxAssetId);
      else if (video.muxUploadId && video.status === 'UPLOADING') {
        await this.mediaQueue.enqueueCancelUpload(video.muxUploadId);
      }
    }
  }

  async stats(userId: string): Promise<CreatorStats> {
    const [[totals], gains, user] = await Promise.all([
      this.prisma.$queryRaw<{ views: bigint; likes: bigint; comments: bigint; videos: bigint }[]>`
        SELECT COALESCE(SUM("viewCount"), 0) AS views, COALESCE(SUM("likeCount"), 0) AS likes,
               COALESCE(SUM("commentCount"), 0) AS comments, COUNT(*) AS videos
        FROM "Video" WHERE "authorId" = ${userId} AND status = 'READY'`,
      this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT to_char(d, 'YYYY-MM-DD') AS date, COUNT(f."followerId") AS count
        FROM generate_series(
          date_trunc('day', now() AT TIME ZONE 'UTC') - interval '6 days',
          date_trunc('day', now() AT TIME ZONE 'UTC'),
          interval '1 day'
        ) d
        LEFT JOIN "Follow" f
          ON f."followingId" = ${userId} AND date_trunc('day', f."createdAt") = d
        GROUP BY d ORDER BY d`,
      this.prisma.user.findUnique({ where: { id: userId }, select: { followerCount: true } }),
    ]);
    if (!user) throw new NotFoundException('User not found');
    return {
      totals: {
        views: Number(totals?.views ?? 0),
        likes: Number(totals?.likes ?? 0),
        comments: Number(totals?.comments ?? 0),
        followers: user.followerCount,
        videos: Number(totals?.videos ?? 0),
      },
      followerGains: gains.map((g) => ({ date: g.date, count: Number(g.count) })),
    };
  }
}
