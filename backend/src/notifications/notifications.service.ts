import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { NotificationDto, Paginated, UnreadCountResponse } from '@app/shared';
import { toPage, type PaginationQueryDto } from '../common/pagination.js';
import { MEDIA_PROVIDER, type MediaProvider } from '../media/media-provider.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toUserSummary, userSummarySelect } from '../users/user-mapper.js';

const SNIPPET_LENGTH = 100;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MEDIA_PROVIDER) private readonly media: MediaProvider,
  ) {}

  /** Newest first, with the actor, video thumbnail and comment snippet loaded in batches. */
  async list(userId: string, query: PaginationQueryDto): Promise<Paginated<NotificationDto>> {
    const rows = await this.prisma.notification.findMany({
      where: { recipientId: userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
      select: {
        id: true,
        type: true,
        videoId: true,
        commentId: true,
        readAt: true,
        createdAt: true,
        actor: { select: userSummarySelect },
      },
    });
    const page = toPage(
      rows,
      query.limit,
      (r) => r.id,
      (r) => r,
    );

    const videoIds = [...new Set(page.items.flatMap((n) => (n.videoId ? [n.videoId] : [])))];
    const commentIds = [...new Set(page.items.flatMap((n) => (n.commentId ? [n.commentId] : [])))];
    const [videos, comments] = await Promise.all([
      this.prisma.video.findMany({
        where: { id: { in: videoIds } },
        select: { id: true, status: true, muxPlaybackId: true },
      }),
      this.prisma.comment.findMany({
        where: { id: { in: commentIds } },
        select: { id: true, body: true, deletedAt: true },
      }),
    ]);
    const videoById = new Map(videos.map((v) => [v.id, v]));
    const commentById = new Map(comments.map((c) => [c.id, c]));

    return {
      nextCursor: page.nextCursor,
      items: page.items.map((n) => {
        const video = n.videoId ? videoById.get(n.videoId) : undefined;
        const comment = n.commentId ? commentById.get(n.commentId) : undefined;
        return {
          id: n.id,
          type: n.type,
          actor: toUserSummary(n.actor),
          video: video
            ? {
                id: video.id,
                thumbnailUrl:
                  video.status === 'READY' && video.muxPlaybackId
                    ? this.media.thumbnailUrl(video.muxPlaybackId)
                    : null,
              }
            : null,
          commentId: n.commentId,
          commentSnippet:
            comment && !comment.deletedAt ? comment.body.slice(0, SNIPPET_LENGTH) : null,
          read: n.readAt !== null,
          createdAt: n.createdAt.toISOString(),
        };
      }),
    };
  }

  async unreadCount(userId: string): Promise<UnreadCountResponse> {
    return {
      count: await this.prisma.notification.count({ where: { recipientId: userId, readAt: null } }),
    };
  }

  /** 404 for someone else's notification, so ids can't be probed. */
  async markRead(userId: string, id: string): Promise<void> {
    const exists = await this.prisma.notification.count({ where: { id, recipientId: userId } });
    if (!exists) throw new NotFoundException('Notification not found');
    await this.prisma.notification.updateMany({
      where: { id, recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
