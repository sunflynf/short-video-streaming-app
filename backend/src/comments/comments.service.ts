import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { CommentDto, Paginated } from '@app/shared';
import type { AuthUser } from '../common/auth-user.js';
import { toPage, type PaginationQueryDto } from '../common/pagination.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { VideosService } from '../videos/videos.service.js';
import { COMMENT_CREATED, type CommentCreatedEvent } from './comment.events.js';
import { commentSelect, toCommentDto } from './comment-mapper.js';
import type { CreateCommentDto } from './dto/create-comment.dto.js';

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly videos: VideosService,
    private readonly events: EventEmitter2,
  ) {}

  /** Replies are one level deep: replying to a reply attaches to its top-level comment. */
  async create(videoId: string, actor: AuthUser, dto: CreateCommentDto): Promise<CommentDto> {
    const video = await this.videos.assertVisible(videoId, actor);

    let rootId: string | undefined;
    let parentAuthorId: string | undefined;
    if (dto.parentId) {
      const parent = await this.prisma.comment.findUnique({
        where: { id: dto.parentId },
        select: { id: true, videoId: true, parentId: true, authorId: true, deletedAt: true },
      });
      if (!parent || parent.videoId !== videoId) {
        throw new BadRequestException('parentId must be a comment on this video');
      }
      if (parent.deletedAt) throw new BadRequestException('Cannot reply to a deleted comment');
      rootId = parent.parentId ?? parent.id;
      parentAuthorId = parent.authorId;
    }

    const [comment] = await this.prisma.$transaction([
      this.prisma.comment.create({
        data: { videoId, authorId: actor.id, parentId: rootId, body: dto.body },
        select: commentSelect,
      }),
      this.prisma.video.update({
        where: { id: videoId },
        data: { commentCount: { increment: 1 } },
      }),
      ...(rootId
        ? [
            this.prisma.comment.update({
              where: { id: rootId },
              data: { replyCount: { increment: 1 } },
            }),
          ]
        : []),
    ]);

    await this.events.emitAsync(COMMENT_CREATED, {
      actorId: actor.id,
      videoId,
      videoAuthorId: video.authorId,
      commentId: comment.id,
      ...(parentAuthorId && { parentAuthorId }),
    } satisfies CommentCreatedEvent);
    return toCommentDto(comment);
  }

  /**
   * Top-level comments, newest first. Deleted ones stay (as "[deleted]") only while they
   * still have replies to anchor. The cursor is the last comment's id.
   */
  async list(
    videoId: string,
    query: PaginationQueryDto,
    viewer?: AuthUser,
  ): Promise<Paginated<CommentDto>> {
    await this.videos.assertVisible(videoId, viewer);
    const rows = await this.prisma.comment.findMany({
      where: {
        videoId,
        parentId: null,
        OR: [{ deletedAt: null }, { replyCount: { gt: 0 } }],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
      select: commentSelect,
    });
    return toPage(rows, query.limit, (r) => r.id, toCommentDto);
  }

  /** Replies to a top-level comment, oldest first. Deleted replies are left out. */
  async replies(
    commentId: string,
    query: PaginationQueryDto,
    viewer?: AuthUser,
  ): Promise<Paginated<CommentDto>> {
    const parent = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { videoId: true },
    });
    if (!parent) throw new NotFoundException('Comment not found');
    await this.videos.assertVisible(parent.videoId, viewer);
    const rows = await this.prisma.comment.findMany({
      where: { parentId: commentId, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
      select: commentSelect,
    });
    return toPage(rows, query.limit, (r) => r.id, toCommentDto);
  }

  /**
   * Soft delete by the comment's author, the video's author or an admin. Idempotent: the
   * counters only move when this call is the one that marked it deleted.
   */
  async remove(commentId: string, actor: AuthUser): Promise<void> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        authorId: true,
        videoId: true,
        parentId: true,
        video: { select: { authorId: true } },
      },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    const allowed =
      actor.id === comment.authorId ||
      actor.id === comment.video.authorId ||
      actor.role === 'ADMIN';
    if (!allowed) throw new ForbiddenException('You cannot delete this comment');

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.comment.updateMany({
        where: { id: commentId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (!count) return;
      await tx.video.update({
        where: { id: comment.videoId },
        data: { commentCount: { decrement: 1 } },
      });
      if (comment.parentId) {
        await tx.comment.update({
          where: { id: comment.parentId },
          data: { replyCount: { decrement: 1 } },
        });
      }
    });
  }
}
