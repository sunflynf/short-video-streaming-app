import type { FeedTab, LikeResponse, Paginated, ShareResponse, VideoDto } from '@app/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Share } from 'react-native';
import { apiFetch } from '../api';
import { restoreSnapshot, setVideoLiked, snapshotVideoCaches } from '../cache-updates';
import { queryKeys } from '../query-keys';

const PAGE_SIZE = 10;

const pageQuery = (
  path: string,
  cursor: string | undefined,
  extra: Record<string, string> = {},
) => {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), ...extra });
  if (cursor) params.set('cursor', cursor);
  return apiFetch<Paginated<VideoDto>>(`${path}?${params}`);
};

const nextCursor = (last: Paginated<unknown>) => last.nextCursor ?? undefined;

export const useFeed = (tab: FeedTab) =>
  useInfiniteQuery({
    queryKey: queryKeys.feed(tab),
    queryFn: ({ pageParam }) => pageQuery('/videos/feed', pageParam, { tab }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  });

export const useUserVideos = (userId: string) =>
  useInfiniteQuery({
    queryKey: queryKeys.userVideos(userId),
    queryFn: ({ pageParam }) => pageQuery(`/users/${userId}/videos`, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  });

export const useVideo = (id: string) =>
  useQuery({ queryKey: queryKeys.video(id), queryFn: () => apiFetch<VideoDto>(`/videos/${id}`) });

/** Optimistic like/unlike: flips the heart everywhere at once, rolls back on failure. */
export function useToggleLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ videoId, like }: { videoId: string; like: boolean }) =>
      apiFetch<LikeResponse>(`/videos/${videoId}/like`, { method: like ? 'POST' : 'DELETE' }),
    onMutate: ({ videoId, like }) => {
      const snapshot = snapshotVideoCaches(qc);
      setVideoLiked(qc, videoId, like);
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => ctx && restoreSnapshot(qc, ctx.snapshot),
    onSuccess: (res, { videoId }) => setVideoLiked(qc, videoId, res.liked, res.likeCount),
  });
}

export async function shareVideo(video: VideoDto): Promise<void> {
  const { shareUrl } = await apiFetch<ShareResponse>(`/videos/${video.id}/share`, {
    method: 'POST',
    body: { channel: 'system' },
  });
  await Share.share({
    message: video.caption ? `${video.caption} ${shareUrl}` : shareUrl,
    url: shareUrl,
  });
}

/** Fire-and-forget: a lost view isn't worth surfacing to the user. */
export function recordView(videoId: string, watchedMs: number): void {
  apiFetch(`/videos/${videoId}/view`, { method: 'POST', body: { watchedMs } }).catch(() => {});
}
