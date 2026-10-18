import type { CreatorStats, ReportReason, VideoDto } from '@app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clearLocalSession } from '../../store/auth';
import { apiFetch } from '../api';
import { queryKeys, VIDEO_LIST_ROOTS } from '../query-keys';

export const reportVideo = (videoId: string, reason: ReportReason) =>
  apiFetch<void>(`/videos/${videoId}/report`, { method: 'POST', body: { reason } });

export const reportComment = (commentId: string, reason: ReportReason) =>
  apiFetch<void>(`/comments/${commentId}/report`, { method: 'POST', body: { reason } });

/** Blocking hides content across feeds, profiles, comments and the inbox, so refetch it all. */
export function useSetBlocked() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, block }: { userId: string; block: boolean }) =>
      apiFetch<void>(`/users/${userId}/block`, { method: block ? 'POST' : 'DELETE' }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useDeleteVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (video: VideoDto) => apiFetch<void>(`/videos/${video.id}`, { method: 'DELETE' }),
    onSuccess: (_res, video) => {
      for (const root of VIDEO_LIST_ROOTS) void qc.invalidateQueries({ queryKey: [root] });
      void qc.invalidateQueries({ queryKey: queryKeys.user(video.author.id) });
      void qc.invalidateQueries({ queryKey: queryKeys.myStats });
    },
  });
}

export const useMyStats = () =>
  useQuery({
    queryKey: queryKeys.myStats,
    queryFn: () => apiFetch<CreatorStats>('/users/me/stats'),
  });

/** Permanently deletes the account; the server has already revoked every session. */
export const useDeleteAccount = () =>
  useMutation({
    mutationFn: (password: string) =>
      apiFetch<void>('/users/me', { method: 'DELETE', body: { password } }),
    onSuccess: () => clearLocalSession(),
  });
