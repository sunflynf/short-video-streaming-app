import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Redis } from 'ioredis';
import { createHash } from 'node:crypto';
import type { AuthUser } from '../common/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS } from '../redis/redis.module.js';
import { isQualifiedView } from './feed-ranking.js';
import { SeenStore } from './seen.store.js';

const VIEW_DEBOUNCE_SEC = 60 * 60;

@Injectable()
export class ViewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seen: SeenStore,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /**
   * Counts at most one view per viewer per video per hour, and only once the clip played long
   * enough. Signed-in views also mark the video as seen so the next feed skips it.
   */
  async record(
    videoId: string,
    watchedMs: number,
    viewer: AuthUser | undefined,
    ip: string | undefined,
  ): Promise<void> {
    const video = await this.prisma.video.findFirst({
      where: { id: videoId, status: 'READY', hidden: false },
      select: { durationSec: true },
    });
    if (!video) throw new NotFoundException('Video not found');
    if (!isQualifiedView(watchedMs, video.durationSec)) return;

    const viewerKey = viewer ? `u:${viewer.id}` : `ip:${hashIp(ip ?? 'unknown')}`;
    const first = await this.redis.set(
      `view:${viewerKey}:${videoId}`,
      '1',
      'EX',
      VIEW_DEBOUNCE_SEC,
      'NX',
    );
    if (first === 'OK') {
      await this.prisma.video.update({
        where: { id: videoId },
        data: { viewCount: { increment: 1 } },
      });
    }
    if (viewer) await this.seen.add(viewer.id, videoId);
  }
}

/** Raw IPs never reach Redis. */
function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 32);
}
