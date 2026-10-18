import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ShareResponse } from '@app/shared';
import { Redis } from 'ioredis';
import type { AuthUser } from '../common/auth-user.js';
import { viewerKey } from '../common/viewer-key.js';
import type { Env } from '../config/env.js';
import { MEDIA_PROVIDER, type MediaProvider } from '../media/media-provider.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS } from '../redis/redis.module.js';
import { VideosService } from '../videos/videos.service.js';
import { renderSharePage } from './share-page.js';

const SHARE_DEBOUNCE_SEC = 60 * 60;

@Injectable()
export class SharesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly videos: VideosService,
    private readonly config: ConfigService<Env, true>,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(MEDIA_PROVIDER) private readonly media: MediaProvider,
  ) {}

  /** Returns the share link; counts at most one share per viewer per video per hour. */
  async share(
    videoId: string,
    viewer: AuthUser | undefined,
    ip: string | undefined,
  ): Promise<ShareResponse> {
    await this.videos.assertVisible(videoId, viewer);
    const first = await this.redis.set(
      `share:${viewerKey(viewer, ip)}:${videoId}`,
      '1',
      'EX',
      SHARE_DEBOUNCE_SEC,
      'NX',
    );
    if (first === 'OK') {
      await this.prisma.video.update({
        where: { id: videoId },
        data: { shareCount: { increment: 1 } },
      });
    }
    return { shareUrl: this.shareUrl(videoId) };
  }

  /** HTML for GET /v/:id, or null when the video isn't publicly visible. */
  async landingPage(videoId: string): Promise<string | null> {
    const video = await this.prisma.video.findFirst({
      where: { id: videoId, status: 'READY', hidden: false },
      select: { caption: true, muxPlaybackId: true, author: { select: { username: true } } },
    });
    if (!video) return null;
    return renderSharePage({
      videoId,
      caption: video.caption,
      authorUsername: video.author.username,
      thumbnailUrl: video.muxPlaybackId ? this.media.thumbnailUrl(video.muxPlaybackId) : null,
    });
  }

  private shareUrl(videoId: string): string {
    const base = this.config.get('PUBLIC_WEB_URL', { infer: true }).replace(/\/+$/, '');
    return `${base}/v/${encodeURIComponent(videoId)}`;
  }
}
