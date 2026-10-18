import type { NotificationDto, Paginated, UnreadCountResponse } from '@app/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api';
import { queryKeys } from '../query-keys';

export const useNotifications = () =>
  useInfiniteQuery({
    queryKey: queryKeys.notifications,
    queryFn: ({ pageParam }) =>
      apiFetch<Paginated<NotificationDto>>(
        `/notifications?limit=20${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

/** Polled for the tab badge. TanStack Query pauses polling while the app is in the background. */
export const useUnreadCount = (enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: () => apiFetch<UnreadCountResponse>('/notifications/unread-count'),
    refetchInterval: 60_000,
    enabled,
  });

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => qc.setQueryData<UnreadCountResponse>(queryKeys.unreadCount, { count: 0 }),
  });
}
