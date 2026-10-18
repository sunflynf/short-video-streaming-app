import type { INestApplication } from '@nestjs/common';
import type { AuthResponse, Paginated, VideoDto } from '@app/shared';
import { Redis } from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { feedScore } from '../src/feed/feed-ranking.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { REDIS } from '../src/redis/redis.module.js';
import { createReadyVideo, hoursAgo, startUpload } from './media-helpers.js';
import { bearer, createTestApp, resetDb, signup } from './utils.js';

type Page = Paginated<VideoDto>;

describe('feed', () => {
  let app: INestApplication<App>;
  let ann: AuthResponse;
  let ben: AuthResponse;
  let cat: AuthResponse;
  const http = () => request(app.getHttpServer());
  const prisma = () => app.get(PrismaService);

  const feed = async (auth?: AuthResponse, query: Record<string, unknown> = {}) => {
    const req = http().get('/v1/videos/feed').query(query);
    if (auth) req.set(bearer(auth));
    return (await req.expect(200)).body as Page;
  };

  /** Follows nextCursor to the end, returning every id in order. */
  const scrollAll = async (auth: AuthResponse | undefined, limit: number) => {
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const page: Page = await feed(auth, { limit, ...(cursor && { cursor }) });
      ids.push(...page.items.map((v) => v.id));
      cursor = page.nextCursor;
    } while (cursor);
    return ids;
  };

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(app);
    ann = await signup(app, { username: 'ann' });
    ben = await signup(app, { username: 'ben' });
    cat = await signup(app, { username: 'cat' });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('For You', () => {
    it('is routed to the feed, not to GET /videos/:id', async () => {
      expect(await feed()).toEqual({ items: [], nextCursor: null });
    });

    it('orders videos by the feedScore ranking', async () => {
      const specs = [
        { likeCount: 0, publishedAt: hoursAgo(0.5) },
        { likeCount: 40, publishedAt: hoursAgo(30) },
        { likeCount: 5, commentCount: 2, publishedAt: hoursAgo(3) },
        { likeCount: 200, shareCount: 10, publishedAt: hoursAgo(100) },
        { likeCount: 1, publishedAt: hoursAgo(10) },
      ];
      const videos = [];
      for (const spec of specs) {
        const id = await createReadyVideo(app, ben.user.id, spec);
        videos.push({ id, commentCount: 0, shareCount: 0, ...spec });
      }
      const now = new Date();
      const expected = [...videos]
        .sort((a, b) => feedScore(b, now) - feedScore(a, now))
        .map((v) => v.id);

      const page = await feed(ann, { limit: 10 });
      expect(page.items.map((v) => v.id)).toEqual(expected);
    });

    it('leaves out own, hidden, unpublished and out-of-window videos (except as fill)', async () => {
      const visible = await createReadyVideo(app, ben.user.id);
      await createReadyVideo(app, ann.user.id); // own
      await createReadyVideo(app, ben.user.id, { hidden: true });
      await startUpload(app, ben); // UPLOADING
      const old = await createReadyVideo(app, ben.user.id, {
        likeCount: 1000,
        publishedAt: hoursAgo(24 * 30),
      });

      const page = await feed(ann, { limit: 10 });
      // The 30-day-old video only appears after the recent ones, despite its likes.
      expect(page.items.map((v) => v.id)).toEqual([visible, old]);
    });

    it('pages through a snapshot without duplicates and then ends', async () => {
      for (let i = 0; i < 60; i++) {
        await createReadyVideo(app, i % 2 ? ben.user.id : cat.user.id, {
          likeCount: i % 7,
          publishedAt: hoursAgo(i % 24),
        });
      }
      const ids = await scrollAll(ann, 10);
      expect(ids).toHaveLength(60);
      expect(new Set(ids).size).toBe(60);
    });

    it('keeps paging stable while scores change', async () => {
      const ids = [];
      for (let i = 0; i < 6; i++) ids.push(await createReadyVideo(app, ben.user.id));
      const first = await feed(ann, { limit: 3 });
      // Boost the last-ranked video: it must not jump into a page already served.
      const last = (await scrollAll(ann, 6)).at(-1)!;
      await prisma().video.update({ where: { id: last }, data: { likeCount: 10_000 } });
      const second = await feed(ann, { limit: 3, cursor: first.nextCursor });
      const all = [...first.items, ...second.items].map((v) => v.id);
      expect(new Set(all).size).toBe(6);
    });

    it('drops videos hidden after the snapshot was taken', async () => {
      const ids = [];
      for (let i = 0; i < 4; i++) ids.push(await createReadyVideo(app, ben.user.id));
      const first = await feed(ann, { limit: 2 });
      const remaining = ids.filter((id) => !first.items.some((v) => v.id === id));
      await prisma().video.update({ where: { id: remaining[0] }, data: { hidden: true } });
      const second = await feed(ann, { limit: 2, cursor: first.nextCursor });
      expect(second.items.map((v) => v.id)).toEqual([remaining[1]]);
    });

    it('skips videos the viewer has watched in the next snapshot', async () => {
      const watched = await createReadyVideo(app, ben.user.id);
      const other = await createReadyVideo(app, ben.user.id);
      await http()
        .post(`/v1/videos/${watched}/view`)
        .set(bearer(ann))
        .send({ watchedMs: 5000 })
        .expect(204);
      expect((await feed(ann)).items.map((v) => v.id)).toEqual([other]);
      // Other viewers still get it.
      expect((await feed(cat)).items.map((v) => v.id)).toContain(watched);
    });

    it('rejects a malformed cursor and restarts on an expired one', async () => {
      await createReadyVideo(app, ben.user.id);
      await http().get('/v1/videos/feed').query({ cursor: 'garbage' }).expect(400);

      const page = await feed(ann, { cursor: 'expiredSnapshot1:20' });
      expect(page.items).toHaveLength(1);
    });

    it("does not let a cursor read another viewer's snapshot", async () => {
      for (let i = 0; i < 3; i++) await createReadyVideo(app, cat.user.id);
      const anns = await feed(ann, { limit: 1 });
      // Ben presenting Ann's cursor gets a fresh snapshot from the start.
      const bens = await feed(ben, { limit: 1, cursor: anns.nextCursor });
      expect(bens.items).toHaveLength(1);
      expect(bens.nextCursor).not.toBe(anns.nextCursor);
    });

    it('serves anonymous viewers a shared, briefly cached first page', async () => {
      const a = await createReadyVideo(app, ben.user.id);
      const first = await feed(undefined, { limit: 1 });
      await createReadyVideo(app, ben.user.id, { likeCount: 1000 });
      const second = await feed(undefined, { limit: 1 });
      expect(second.items.map((v) => v.id)).toEqual([a]);
      expect(second.nextCursor).toBe(first.nextCursor);

      // Once the cache expires, the new video shows up.
      await app.get<Redis>(REDIS).del('feed:anon:current');
      const third = await feed(undefined, { limit: 1 });
      expect(third.items[0]!.id).not.toBe(a);
    });

    it('marks videos the viewer liked', async () => {
      const liked = await createReadyVideo(app, ben.user.id);
      await createReadyVideo(app, ben.user.id);
      await http().post(`/v1/videos/${liked}/like`).set(bearer(ann)).expect(200);
      const page = await feed(ann);
      expect(page.items.find((v) => v.id === liked)?.likedByMe).toBe(true);
      expect(page.items.filter((v) => v.likedByMe)).toHaveLength(1);
    });
  });

  describe('Following', () => {
    it('marks videos whose author the viewer follows', async () => {
      await createReadyVideo(app, ben.user.id);
      await createReadyVideo(app, cat.user.id);
      await http().post(`/v1/users/${ben.user.id}/follow`).set(bearer(ann)).expect(200);
      const page = await feed(ann);
      expect(
        Object.fromEntries(page.items.map((v) => [v.author.username, v.followingAuthor])),
      ).toEqual({ ben: true, cat: false });
      expect((await feed()).items.every((v) => !v.followingAuthor)).toBe(true);
    });

    it('lists followed creators newest first, with paging', async () => {
      await http().post(`/v1/users/${ben.user.id}/follow`).set(bearer(ann)).expect(200);
      const older = await createReadyVideo(app, ben.user.id, { publishedAt: hoursAgo(5) });
      const newer = await createReadyVideo(app, ben.user.id, { publishedAt: hoursAgo(1) });
      await createReadyVideo(app, cat.user.id); // not followed
      await createReadyVideo(app, ben.user.id, { hidden: true });

      const first = await feed(ann, { tab: 'following', limit: 1 });
      expect(first.items.map((v) => v.id)).toEqual([newer]);
      const second = await feed(ann, { tab: 'following', limit: 1, cursor: first.nextCursor });
      expect(second).toMatchObject({ items: [{ id: older }], nextCursor: null });
    });

    it('requires sign-in and validates the tab', async () => {
      await http().get('/v1/videos/feed').query({ tab: 'following' }).expect(401);
      await http().get('/v1/videos/feed').query({ tab: 'trending' }).expect(400);
    });
  });
});
