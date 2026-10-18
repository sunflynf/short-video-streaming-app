import type { CommentDto, Paginated } from '@app/shared';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api';
import { adjustCommentCount } from '../cache-updates';
import { queryKeys } from '../query-keys';

const nextCursor = (last: Paginated<unknown>) => last.nextCursor ?? undefined;

export const useComments = (videoId: string) =>
  useInfiniteQuery({
    queryKey: queryKeys.comments(videoId),
    queryFn: ({ pageParam }) =>
      apiFetch<Paginated<CommentDto>>(
        `/videos/${videoId}/comments?limit=20${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  });

export const useReplies = (commentId: string, enabled: boolean) =>
  useInfiniteQuery({
    queryKey: queryKeys.replies(commentId),
    queryFn: ({ pageParam }) =>
      apiFetch<Paginated<CommentDto>>(
        `/comments/${commentId}/replies?limit=20${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    enabled,
  });

export function useCreateComment(videoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { body: string; parentId?: string }) =>
      apiFetch<CommentDto>(`/videos/${videoId}/comments`, { method: 'POST', body }),
    onSuccess: (comment) => {
      adjustCommentCount(qc, videoId, 1);
      void qc.invalidateQueries({
        queryKey: comment.parentId
          ? queryKeys.replies(comment.parentId)
          : queryKeys.comments(videoId),
      });
      if (comment.parentId) void qc.invalidateQueries({ queryKey: queryKeys.comments(videoId) });
    },
  });
}

export function useDeleteComment(videoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (comment: CommentDto) =>
      apiFetch<void>(`/comments/${comment.id}`, { method: 'DELETE' }),
    onSuccess: (_res, comment) => {
      adjustCommentCount(qc, videoId, -1);
      void qc.invalidateQueries({ queryKey: queryKeys.comments(videoId) });
      if (comment.parentId)
        void qc.invalidateQueries({ queryKey: queryKeys.replies(comment.parentId) });
    },
  });
}
