import type { Paginated, UserProfile, VideoDto } from '@app/shared';
import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';
import { VIDEO_LIST_ROOTS } from './query-keys';

type Pages<T> = InfiniteData<Paginated<T>>;

/** Applies `fn` to every item of every page, keeping untouched objects identical. */
export function mapPages<T>(data: Pages<T> | undefined, fn: (item: T) => T): Pages<T> | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({ ...page, items: page.items.map(fn) })),
  };
}

export type CacheSnapshot = [QueryKey, unknown][];

const ROOTS = [...VIDEO_LIST_ROOTS, 'video', 'user'];

/** Everything an optimistic update may touch, for rolling back on error. */
export function snapshotVideoCaches(qc: QueryClient): CacheSnapshot {
  return ROOTS.flatMap((root) => qc.getQueriesData({ queryKey: [root] }));
}

export function restoreSnapshot(qc: QueryClient, snapshot: CacheSnapshot): void {
  for (const [key, data] of snapshot) qc.setQueryData(key, data);
}

/** Patches matching videos in every cached feed, profile list, liked list and single video. */
export function updateVideos(
  qc: QueryClient,
  match: (video: VideoDto) => boolean,
  patch: (video: VideoDto) => VideoDto,
): void {
  const apply = (v: VideoDto) => (match(v) ? patch(v) : v);
  for (const root of VIDEO_LIST_ROOTS) {
    qc.setQueriesData<Pages<VideoDto>>({ queryKey: [root] }, (data) => mapPages(data, apply));
  }
  qc.setQueriesData<VideoDto>({ queryKey: ['video'] }, (v) => (v ? apply(v) : v));
}

export function setVideoLiked(
  qc: QueryClient,
  videoId: string,
  liked: boolean,
  likeCount?: number,
): void {
  updateVideos(
    qc,
    (v) => v.id === videoId,
    (v) => ({
      ...v,
      likedByMe: liked,
      likeCount:
        likeCount ?? Math.max(0, v.likeCount + (liked === v.likedByMe ? 0 : liked ? 1 : -1)),
    }),
  );
}

export function setFollowing(qc: QueryClient, userId: string, following: boolean): void {
  updateVideos(
    qc,
    (v) => v.author.id === userId,
    (v) => ({ ...v, followingAuthor: following }),
  );
  qc.setQueryData<UserProfile>(['user', userId], (p) =>
    p && p.isFollowing !== following
      ? {
          ...p,
          isFollowing: following,
          followerCount: Math.max(0, p.followerCount + (following ? 1 : -1)),
        }
      : p,
  );
}

export function adjustCommentCount(qc: QueryClient, videoId: string, delta: number): void {
  updateVideos(
    qc,
    (v) => v.id === videoId,
    (v) => ({ ...v, commentCount: Math.max(0, v.commentCount + delta) }),
  );
}
