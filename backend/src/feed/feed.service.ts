import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Paginated, VideoDto } from '@app/shared';
import { Redis } from 'ioredis';
import { randomBytes } from 'node:crypto';
import type { AuthUser } from '../common/auth-user.js';
import { toPage, type PaginationQueryDto } from '../common/pagination.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS } from '../redis/redis.module.js';
import { videoSelect } from '../videos/video-mapper.js';
import { VideosService } from '../videos/videos.service.js';
import { formatFeedCursor, parseFeedCursor } from './feed-ranking.js';
import { SeenStore } from './seen.store.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const ANON_CURRENT_KEY = 'feed:anon:current';

type Snapshot = { id: string; ids: string[] };

@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly videos: VideosService,
    private readonly seen: SeenStore,
    private readonly config: ConfigService<Env, true>,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /**
   * Ranked feed served from a snapshot of video ids cached in Redis, so paging is stable
   * while scores change. The feed ends with the snapshot; a refresh (no cursor) builds a new
   * one that skips what the viewer has watched. Anonymous viewers share one snapshot.
   */
  async forYou(query: PaginationQueryDto, viewer?: AuthUser): Promise<Paginated<VideoDto>> {
    let snapshot: Snapshot | null = null;
    let offset = 0;
    if (query.cursor) {
      const cursor = parseFeedCursor(query.cursor);
      if (!cursor) throw new BadRequestException('Invalid cursor');
      snapshot = await this.loadSnapshot(viewer?.id, cursor.snapshotId);
      // An expired snapshot restarts the feed rather than failing the request.
      if (snapshot) offset = cursor.offset;
    }
    snapshot ??= viewer ? await this.createSnapshot(viewer.id) : await this.anonymousSnapshot();

    const pageIds = snapshot.ids.slice(offset, offset + query.limit);
    const rows = await this.prisma.video.findMany({
      // Re-check visibility: videos may have been hidden or deleted since the snapshot.
      where: { id: { in: pageIds }, status: 'READY', hidden: false },
      select: videoSelect,
    });
    const position = new Map(pageIds.map((id, i) => [id, i]));
    rows.sort((a, b) => position.get(a.id)! - position.get(b.id)!);

    const nextOffset = offset + query.limit;
    return {
      items: await this.videos.toDtos(rows, viewer?.id),
      nextCursor:
        nextOffset < snapshot.ids.length ? formatFeedCursor(snapshot.id, nextOffset) : null,
    };
  }

  /** Newest videos from creators the viewer follows. The cursor is the last video's id. */
  async following(query: PaginationQueryDto, viewer?: AuthUser): Promise<Paginated<VideoDto>> {
    if (!viewer) throw new UnauthorizedException('Sign in to see the Following feed');
    const rows = await this.prisma.video.findMany({
      where: {
        status: 'READY',
        hidden: false,
        author: { followers: { some: { followerId: viewer.id } } },
      },
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
    return { items: await this.videos.toDtos(page.items, viewer.id), nextCursor: page.nextCursor };
  }

  private async anonymousSnapshot(): Promise<Snapshot> {
    const currentId = await this.redis.get(ANON_CURRENT_KEY);
    const current = currentId ? await this.loadSnapshot(undefined, currentId) : null;
    if (current) return current;
    const snapshot = await this.createSnapshot(undefined);
    await this.redis.set(
      ANON_CURRENT_KEY,
      snapshot.id,
      'EX',
      this.config.get('ANON_FEED_CACHE_SEC', { infer: true }),
    );
    return snapshot;
  }

  private async createSnapshot(viewerId: string | undefined): Promise<Snapshot> {
    const size = this.config.get('FEED_SNAPSHOT_SIZE', { infer: true });
    const excluded = viewerId ? await this.seen.list(viewerId) : [];
    const now = new Date();
    const windowStart = new Date(
      now.getTime() - this.config.get('FEED_WINDOW_DAYS', { infer: true }) * DAY_MS,
    );

    const ids = await this.rankedIds(viewerId, excluded, now, windowStart, size);
    if (ids.length < size) {
      // Not enough recent videos: fill with older ones, newest first.
      const older = await this.prisma.video.findMany({
        where: {
          status: 'READY',
          hidden: false,
          publishedAt: { lt: windowStart },
          id: { notIn: excluded },
          ...(viewerId && { authorId: { not: viewerId } }),
        },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take: size - ids.length,
        select: { id: true },
      });
      ids.push(...older.map((v) => v.id));
    }

    const snapshot = { id: randomBytes(12).toString('base64url'), ids };
    await this.redis.set(
      this.snapshotKey(viewerId, snapshot.id),
      JSON.stringify(ids),
      'EX',
      this.config.get('FEED_SNAPSHOT_TTL_SEC', { infer: true }),
    );
    return snapshot;
  }

  /**
   * The SQL twin of feedScore() in feed-ranking.ts; keep the two in sync. float8 math keeps
   * this ~10x faster than Postgres numeric (6 ms vs 64 ms over 10k videos).
   */
  private async rankedIds(
    viewerId: string | undefined,
    excluded: string[],
    now: Date,
    windowStart: Date,
    limit: number,
  ): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Video"
      WHERE status = 'READY'
        AND hidden = false
        AND "publishedAt" >= ${windowStart}::timestamp
        AND (${viewerId ?? null}::text IS NULL OR "authorId" <> ${viewerId ?? null}::text)
        AND NOT (id = ANY(${excluded}::text[]))
      ORDER BY
        ("likeCount" * 2 + "commentCount" * 3 + "shareCount" * 4 + 1)::float8
          / power(
              GREATEST(EXTRACT(EPOCH FROM (${now}::timestamp - "publishedAt"))::float8 / 3600, 0) + 2,
              1.5
            )
          DESC,
        id DESC
      LIMIT ${limit}`;
    return rows.map((r) => r.id);
  }

  private async loadSnapshot(
    viewerId: string | undefined,
    snapshotId: string,
  ): Promise<Snapshot | null> {
    const raw = await this.redis.get(this.snapshotKey(viewerId, snapshotId));
    return raw ? { id: snapshotId, ids: JSON.parse(raw) as string[] } : null;
  }

  /** Keyed by viewer, so a cursor can't be used to read someone else's snapshot. */
  private snapshotKey(viewerId: string | undefined, snapshotId: string): string {
    return viewerId ? `feed:u:${viewerId}:${snapshotId}` : `feed:anon:${snapshotId}`;
  }
}
