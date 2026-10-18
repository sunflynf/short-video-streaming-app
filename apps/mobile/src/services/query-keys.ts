import type { FeedTab } from '@app/shared';

export const queryKeys = {
  feed: (tab: FeedTab) => ['feed', tab] as const,
  userVideos: (userId: string) => ['userVideos', userId] as const,
  liked: (userId: string) => ['liked', userId] as const,
  video: (id: string) => ['video', id] as const,
  user: (id: string) => ['user', id] as const,
  comments: (videoId: string) => ['comments', videoId] as const,
  replies: (commentId: string) => ['replies', commentId] as const,
  notifications: ['notifications'] as const,
  unreadCount: ['unreadCount'] as const,
};

/** Query roots that hold lists of VideoDto pages. */
export const VIDEO_LIST_ROOTS = ['feed', 'userVideos', 'liked'] as const;
