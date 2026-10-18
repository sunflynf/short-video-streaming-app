import { BadRequestException, Injectable } from '@nestjs/common';
import type { Paginated, UserSummary } from '@app/shared';
import { toPage, type PaginationQueryDto } from '../common/pagination.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toUserSummary, userSummarySelect } from '../users/user-mapper.js';

@Injectable()
export class BlocksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Blocking cuts the tie both ways: follows in either direction are removed (with counters),
   * existing notifications between the two are deleted, and from then on neither sees the
   * other's videos or comments nor can follow them.
   */
  async block(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) throw new BadRequestException('You cannot block yourself');
    await this.prisma.$transaction(async (tx) => {
      await tx.block.createMany({ data: [{ blockerId, blockedId }], skipDuplicates: true });
      for (const [followerId, followingId] of [
        [blockerId, blockedId],
        [blockedId, blockerId],
      ] as const) {
        const { count } = await tx.follow.deleteMany({ where: { followerId, followingId } });
        if (!count) continue;
        await tx.user.update({
          where: { id: followerId },
          data: { followingCount: { decrement: 1 } },
        });
        await tx.user.update({
          where: { id: followingId },
          data: { followerCount: { decrement: 1 } },
        });
      }
      await tx.notification.deleteMany({
        where: {
          OR: [
            { recipientId: blockerId, actorId: blockedId },
            { recipientId: blockedId, actorId: blockerId },
          ],
        },
      });
    });
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await this.prisma.block.deleteMany({ where: { blockerId, blockedId } });
  }

  async list(blockerId: string, query: PaginationQueryDto): Promise<Paginated<UserSummary>> {
    const rows = await this.prisma.block.findMany({
      where: { blockerId },
      orderBy: [{ createdAt: 'desc' }, { blockedId: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor && {
        cursor: { blockerId_blockedId: { blockerId, blockedId: query.cursor } },
        skip: 1,
      }),
      select: { blockedId: true, blocked: { select: userSummarySelect } },
    });
    return toPage(
      rows,
      query.limit,
      (r) => r.blockedId,
      (r) => toUserSummary(r.blocked),
    );
  }

  /** Users hidden from `viewerId`: those they blocked and those who blocked them. */
  async hiddenUserIds(viewerId: string | undefined): Promise<string[]> {
    if (!viewerId) return [];
    const rows = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: { blockerId: true, blockedId: true },
    });
    return rows.map((r) => (r.blockerId === viewerId ? r.blockedId : r.blockerId));
  }

  async isBlockedEitherWay(a: string, b: string): Promise<boolean> {
    const count = await this.prisma.block.count({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
    });
    return count > 0;
  }

  /** The block status of `userId` from the viewer's side, for profile UIs. */
  async blockedByViewer(viewerId: string, userId: string): Promise<boolean> {
    return (
      (await this.prisma.block.count({ where: { blockerId: viewerId, blockedId: userId } })) > 0
    );
  }
}
