import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUTO_HIDE_REPORT_THRESHOLD,
  type Paginated,
  type ReportGroupDto,
  type ReportReason,
} from '@app/shared';
import type { AuthUser } from '../common/auth-user.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toUserSummary, userSummarySelect } from '../users/user-mapper.js';
import { VideosService } from '../videos/videos.service.js';
import type { ReportDto } from './dto/report.dto.js';

/** True once a video has enough distinct open reports to hide it pending review. */
export function shouldAutoHide(openReports: number): boolean {
  return openReports >= AUTO_HIDE_REPORT_THRESHOLD;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly videos: VideosService,
  ) {}

  /** Idempotent per reporter. Enough distinct reporters hide the video until an admin reviews it. */
  async reportVideo(videoId: string, reporter: AuthUser, dto: ReportDto): Promise<void> {
    const video = await this.videos.assertVisible(videoId, reporter);
    if (video.authorId === reporter.id)
      throw new BadRequestException('You can’t report your own video');
    await this.createOnce({
      reporterId: reporter.id,
      videoId,
      reason: dto.reason,
      details: dto.details,
    });

    const open = await this.prisma.report.count({ where: { videoId, resolvedAt: null } });
    if (shouldAutoHide(open)) {
      await this.prisma.video.updateMany({
        where: { id: videoId, hidden: false },
        data: { hidden: true },
      });
    }
  }

  async reportComment(commentId: string, reporter: AuthUser, dto: ReportDto): Promise<void> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { authorId: true, videoId: true, deletedAt: true },
    });
    if (!comment || comment.deletedAt) throw new NotFoundException('Comment not found');
    await this.videos.assertVisible(comment.videoId, reporter);
    if (comment.authorId === reporter.id) {
      throw new BadRequestException('You can’t report your own comment');
    }
    await this.createOnce({
      reporterId: reporter.id,
      commentId,
      reason: dto.reason,
      details: dto.details,
    });
  }

  /** Open reports grouped by target, most recently reported first. The cursor is an offset. */
  async listOpen(cursor: string | undefined, limit: number): Promise<Paginated<ReportGroupDto>> {
    const offset = cursor ? Number(cursor) : 0;
    if (!Number.isInteger(offset) || offset < 0) throw new BadRequestException('Invalid cursor');

    const groups = await this.prisma.report.groupBy({
      by: ['videoId', 'commentId'],
      where: { resolvedAt: null },
      _count: { _all: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
      skip: offset,
      take: limit + 1,
    });
    const page = groups.slice(0, limit);
    const videoIds = page.flatMap((g) => (g.videoId ? [g.videoId] : []));
    const commentIds = page.flatMap((g) => (g.commentId ? [g.commentId] : []));

    const [videos, comments, reasons, latest] = await Promise.all([
      this.prisma.video.findMany({
        where: { id: { in: videoIds } },
        select: { id: true, hidden: true, author: { select: userSummarySelect } },
      }),
      this.prisma.comment.findMany({
        where: { id: { in: commentIds } },
        select: { id: true, videoId: true, author: { select: userSummarySelect } },
      }),
      this.prisma.report.groupBy({
        by: ['videoId', 'commentId', 'reason'],
        where: {
          resolvedAt: null,
          OR: [{ videoId: { in: videoIds } }, { commentId: { in: commentIds } }],
        },
        _count: { _all: true },
      }),
      this.prisma.report.findMany({
        where: {
          resolvedAt: null,
          details: { not: null },
          OR: [{ videoId: { in: videoIds } }, { commentId: { in: commentIds } }],
        },
        orderBy: { createdAt: 'desc' },
        select: { videoId: true, commentId: true, details: true },
      }),
    ]);
    const videoById = new Map(videos.map((v) => [v.id, v]));
    const commentById = new Map(comments.map((c) => [c.id, c]));
    const key = (r: { videoId: string | null; commentId: string | null }) =>
      r.videoId ? `v:${r.videoId}` : `c:${r.commentId}`;

    const items: ReportGroupDto[] = [];
    for (const g of page) {
      const groupReasons: Partial<Record<ReportReason, number>> = {};
      for (const r of reasons.filter((r) => key(r) === key(g)))
        groupReasons[r.reason] = r._count._all;
      const base = {
        reportCount: g._count._all,
        reasons: groupReasons,
        latestDetails: latest.find((l) => key(l) === key(g))?.details ?? null,
        firstReportedAt: g._min.createdAt!.toISOString(),
        lastReportedAt: g._max.createdAt!.toISOString(),
      };
      if (g.videoId) {
        const video = videoById.get(g.videoId);
        if (video) {
          items.push({
            ...base,
            target: { type: 'video', id: video.id, hidden: video.hidden },
            owner: toUserSummary(video.author),
          });
        }
      } else if (g.commentId) {
        const comment = commentById.get(g.commentId);
        if (comment) {
          items.push({
            ...base,
            target: { type: 'comment', id: comment.id, videoId: comment.videoId },
            owner: toUserSummary(comment.author),
          });
        }
      }
    }
    return { items, nextCursor: groups.length > limit ? String(offset + limit) : null };
  }

  async resolve(target: { videoId?: string; commentId?: string }, admin: AuthUser): Promise<void> {
    await this.prisma.report.updateMany({
      where: {
        resolvedAt: null,
        ...(target.videoId ? { videoId: target.videoId } : { commentId: target.commentId }),
      },
      data: { resolvedAt: new Date(), resolvedById: admin.id },
    });
  }

  async setVideoHidden(videoId: string, hidden: boolean): Promise<void> {
    const { count } = await this.prisma.video.updateMany({
      where: { id: videoId },
      data: { hidden },
    });
    if (!count) throw new NotFoundException('Video not found');
  }

  private async createOnce(data: Prisma.ReportUncheckedCreateInput): Promise<void> {
    try {
      await this.prisma.report.create({ data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
      throw err;
    }
  }
}
