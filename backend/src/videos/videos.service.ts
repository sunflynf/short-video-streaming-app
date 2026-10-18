import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Paginated, VideoDto } from '@app/shared';
import type { AuthUser } from '../common/auth-user.js';
import { BlocksService } from '../blocks/blocks.service.js';
import { toPage, type PaginationQueryDto } from '../common/pagination.js';
import { MEDIA_PROVIDER, type MediaProvider } from '../media/media-provider.js';
import { MediaQueue } from '../media/media.queue.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import type { UpdateVideoDto } from './dto/update-video.dto.js';
import { toVideoDto, videoSelect, type VideoRow } from './video-mapper.js';

@Injectable()
export class VideosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly queue: MediaQueue,
    private readonly blocks: BlocksService,
    @Inject(MEDIA_PROVIDER) private readonly media: MediaProvider,
  ) {}

  /** Published videos are public; the author and admins also see unpublished or hidden ones. */
  async get(id: string, viewer?: AuthUser): Promise<VideoDto> {
    const video = await this.find(id);
    await this.checkVisible(video, viewer);
    const [dto] = await this.toDtos([video], viewer?.id);
    return dto!;
  }

  /** Maps rows to DTOs, filling `likedByMe` and `followingAuthor` with one query each. */
  async toDtos(rows: VideoRow[], viewerId?: string): Promise<VideoDto[]> {
    const liked = new Set<string>();
    const followed = new Set<string>();
    if (viewerId && rows.length) {
      const [likes, follows] = await Promise.all([
        this.prisma.like.findMany({
          where: { userId: viewerId, videoId: { in: rows.map((r) => r.id) } },
          select: { videoId: true },
        }),
        this.prisma.follow.findMany({
          where: {
            followerId: viewerId,
            followingId: { in: [...new Set(rows.map((r) => r.authorId))] },
          },
          select: { followingId: true },
        }),
      ]);
      for (const like of likes) liked.add(like.videoId);
      for (const follow of follows) followed.add(follow.followingId);
    }
    return rows.map((row) =>
      toVideoDto(row, this.media, liked.has(row.id), followed.has(row.authorId)),
    );
  }

  async update(id: string, actor: AuthUser, dto: UpdateVideoDto): Promise<VideoDto> {
    const video = await this.find(id);
    if (video.authorId !== actor.id) {
      throw new ForbiddenException('Only the author can edit this video');
    }
    const updated = await this.prisma.video.update({
      where: { id },
      data: { caption: dto.caption ?? null },
      select: videoSelect,
    });
    const [result] = await this.toDtos([updated], actor.id);
    return result!;
  }

  /** Deletes the row now and cleans up at the provider through the queue (with retries). */
  async remove(id: string, actor: AuthUser): Promise<void> {
    const video = await this.prisma.video.findUnique({
      where: { id },
      select: { id: true, authorId: true, status: true, muxAssetId: true, muxUploadId: true },
    });
    if (!video) throw new NotFoundException('Video not found');
    if (!this.isOwnerOrAdmin(video, actor)) {
      throw new ForbiddenException('Only the author can delete this video');
    }
    await this.prisma.video.delete({ where: { id } });
    if (video.muxAssetId) {
      await this.queue.enqueueDeleteAsset(video.muxAssetId);
    } else if (video.muxUploadId && video.status === 'UPLOADING') {
      // If the file still arrives, the processor finds no video and deletes the new asset.
      await this.queue.enqueueCancelUpload(video.muxUploadId);
    }
  }

  /** A creator's published videos, newest first. The cursor is the last video's id. */
  async listByAuthor(
    authorId: string,
    query: PaginationQueryDto,
    viewer?: AuthUser,
  ): Promise<Paginated<VideoDto>> {
    await this.users.assertExists(authorId);
    if (
      viewer &&
      viewer.id !== authorId &&
      (await this.blocks.isBlockedEitherWay(viewer.id, authorId))
    ) {
      return { items: [], nextCursor: null };
    }
    const rows = await this.prisma.video.findMany({
      where: { authorId, status: 'READY', hidden: false },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
      select: videoSelect,
    });
    const page = toPage(
      rows,
      query.limit,
      (r) => r.id,
      (r) => r,
    );
    return { items: await this.toDtos(page.items, viewer?.id), nextCursor: page.nextCursor };
  }

  /** 404 unless the viewer may see the video (same rule as GET /videos/:id). */
  async assertVisible(
    id: string,
    viewer?: AuthUser,
  ): Promise<{
    id: string;
    authorId: string;
    caption: string | null;
    muxPlaybackId: string | null;
  }> {
    const video = await this.prisma.video.findUnique({
      where: { id },
      select: {
        id: true,
        authorId: true,
        status: true,
        hidden: true,
        caption: true,
        muxPlaybackId: true,
      },
    });
    if (!video) throw new NotFoundException('Video not found');
    await this.checkVisible(video, viewer);
    return video;
  }

  /** Unpublished videos are the author's (and admins') only; blocks hide videos both ways. */
  private async checkVisible(
    video: { authorId: string; status: string; hidden: boolean },
    viewer?: AuthUser,
  ): Promise<void> {
    const published = video.status === 'READY' && !video.hidden;
    if (!published && !this.isOwnerOrAdmin(video, viewer)) {
      throw new NotFoundException('Video not found');
    }
    if (
      viewer &&
      viewer.id !== video.authorId &&
      (await this.blocks.isBlockedEitherWay(viewer.id, video.authorId))
    ) {
      throw new NotFoundException('Video not found');
    }
  }

  private async find(id: string): Promise<VideoRow> {
    const video = await this.prisma.video.findUnique({ where: { id }, select: videoSelect });
    if (!video) throw new NotFoundException('Video not found');
    return video;
  }

  private isOwnerOrAdmin(video: { authorId: string }, user?: AuthUser): boolean {
    return !!user && (user.id === video.authorId || user.role === 'ADMIN');
  }
}
