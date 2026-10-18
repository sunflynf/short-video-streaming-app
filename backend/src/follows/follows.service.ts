import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { FollowResponse, Paginated, UserSummary } from '@app/shared';
import { Prisma } from '../generated/prisma/client.js';
import { toPage, type PaginationQueryDto } from '../common/pagination.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toUserSummary, userSummarySelect } from '../users/user-mapper.js';
import { UsersService } from '../users/users.service.js';
import { FOLLOW_CREATED, type FollowCreatedEvent } from './follow.events.js';

@Injectable()
export class FollowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly events: EventEmitter2,
  ) {}

  /** Idempotent: following someone you already follow is a no-op. */
  async follow(followerId: string, followingId: string): Promise<FollowResponse> {
    if (followerId === followingId) {
      throw new BadRequestException('You cannot follow yourself');
    }
    await this.users.assertExists(followingId);
    try {
      await this.prisma.$transaction([
        this.prisma.follow.create({ data: { followerId, followingId } }),
        this.prisma.user.update({
          where: { id: followerId },
          data: { followingCount: { increment: 1 } },
        }),
        this.prisma.user.update({
          where: { id: followingId },
          data: { followerCount: { increment: 1 } },
        }),
      ]);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { following: true };
      }
      throw err;
    }
    this.events.emit(FOLLOW_CREATED, { followerId, followingId } satisfies FollowCreatedEvent);
    return { following: true };
  }

  /** Idempotent: unfollowing someone you don't follow is a no-op. */
  async unfollow(followerId: string, followingId: string): Promise<FollowResponse> {
    await this.users.assertExists(followingId);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.follow.deleteMany({ where: { followerId, followingId } });
      if (!count) return;
      await tx.user.update({
        where: { id: followerId },
        data: { followingCount: { decrement: 1 } },
      });
      await tx.user.update({
        where: { id: followingId },
        data: { followerCount: { decrement: 1 } },
      });
    });
    return { following: false };
  }

  /** Users who follow `userId`, newest first. The cursor is the last follower's id. */
  async followers(userId: string, query: PaginationQueryDto): Promise<Paginated<UserSummary>> {
    await this.users.assertExists(userId);
    const rows = await this.prisma.follow.findMany({
      where: { followingId: userId },
      orderBy: [{ createdAt: 'desc' }, { followerId: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor && {
        cursor: { followerId_followingId: { followerId: query.cursor, followingId: userId } },
        skip: 1,
      }),
      select: { followerId: true, follower: { select: userSummarySelect } },
    });
    return toPage(
      rows,
      query.limit,
      (r) => r.followerId,
      (r) => toUserSummary(r.follower),
    );
  }

  /** Users `userId` follows, newest first. The cursor is the last followed user's id. */
  async following(userId: string, query: PaginationQueryDto): Promise<Paginated<UserSummary>> {
    await this.users.assertExists(userId);
    const rows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      orderBy: [{ createdAt: 'desc' }, { followingId: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor && {
        cursor: { followerId_followingId: { followerId: userId, followingId: query.cursor } },
        skip: 1,
      }),
      select: { followingId: true, following: { select: userSummarySelect } },
    });
    return toPage(
      rows,
      query.limit,
      (r) => r.followingId,
      (r) => toUserSummary(r.following),
    );
  }
}
