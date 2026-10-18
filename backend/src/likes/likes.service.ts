import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { LikeResponse, Paginated, VideoDto } from '@app/shared';
import type { AuthUser } from '../common/auth-user.js';
import { BlocksService } from '../blocks/blocks.service.js';
import { toPage, type PaginationQueryDto } from '../common/pagination.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { videoSelect } from '../videos/video-mapper.js';
import { VideosService } from '../videos/videos.service.js';
import { LIKE_CREATED, type LikeCreatedEvent } from './like.events.js';

@Injectable()
export class LikesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly videos: VideosService,
    private readonly events: EventEmitter2,
    private readonly blocks: BlocksService,
  ) {}

  /** Idempotent. Only published videos can be liked. */
  async like(userId: string, videoId: string): Promise<LikeResponse> {
    const video = await this.prisma.video.findFirst({
      where: { id: videoId, status: 'READY', hidden: false },
      select: { authorId: true },
    });
    if (!video) throw new NotFoundException('Video not found');
    if (
      video.authorId !== userId &&
      (await this.blocks.isBlockedEitherWay(userId, video.authorId))
    ) {
      throw new NotFoundException('Video not found');
    }
    try {
      const [, updated] = await this.prisma.$transaction([
        this.prisma.like.create({ data: { userId, videoId } }),
        this.prisma.video.update({
          where: { id: videoId },
          data: { likeCount: { increment: 1 } },
          select: { likeCount: true },
        }),
      ]);
      await this.events.emitAsync(LIKE_CREATED, {
        actorId: userId,
        videoId,
        authorId: video.authorId,
      } satisfies LikeCreatedEvent);
      return { liked: true, likeCount: updated.likeCount };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { liked: true, likeCount: await this.likeCount(videoId) };
      }
      throw err;
    }
  }

  /** Idempotent. Works on hidden videos too, so a like can always be taken back. */
  async unlike(userId: string, videoId: string): Promise<LikeResponse> {
    return this.prisma.$transaction(async (tx) => {
      const video = await tx.video.findUnique({ where: { id: videoId }, select: { id: true } });
      if (!video) throw new NotFoundException('Video not found');
      const { count } = await tx.like.deleteMany({ where: { userId, videoId } });
      if (!count) {
        const current = await tx.video.findUniqueOrThrow({
          where: { id: videoId },
          select: { likeCount: true },
        });
        return { liked: false, likeCount: current.likeCount };
      }
      const updated = await tx.video.update({
        where: { id: videoId },
        data: { likeCount: { decrement: 1 } },
        select: { likeCount: true },
      });
      return { liked: false, likeCount: updated.likeCount };
    });
  }

  /** The user's liked videos, most recently liked first. The cursor is the last video's id. */
  async listLiked(
    userId: string,
    viewer: AuthUser,
    query: PaginationQueryDto,
  ): Promise<Paginated<VideoDto>> {
    if (viewer.id !== userId) throw new ForbiddenException('Liked videos are private');
    await this.users.assertExists(userId);
    const rows = await this.prisma.like.findMany({
      where: { userId, video: { status: 'READY', hidden: false } },
      orderBy: [{ createdAt: 'desc' }, { videoId: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor && {
        cursor: { userId_videoId: { userId, videoId: query.cursor } },
        skip: 1,
      }),
      select: { videoId: true, video: { select: videoSelect } },
    });
    const page = toPage(
      rows,
      query.limit,
      (r) => r.videoId,
      (r) => r.video,
    );
    return { items: await this.videos.toDtos(page.items, viewer.id), nextCursor: page.nextCursor };
  }

  private async likeCount(videoId: string): Promise<number> {
    const video = await this.prisma.video.findUniqueOrThrow({
      where: { id: videoId },
      select: { likeCount: true },
    });
    return video.likeCount;
  }
}
