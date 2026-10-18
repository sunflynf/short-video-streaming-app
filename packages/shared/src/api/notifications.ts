import type { UserSummary } from './users';

export type NotificationType = 'LIKE' | 'COMMENT' | 'REPLY' | 'FOLLOW';

export type NotificationDto = {
  id: string;
  type: NotificationType;
  actor: UserSummary;
  /** null for FOLLOW, or when the video has since been deleted. */
  video: { id: string; thumbnailUrl: string | null } | null;
  commentId: string | null;
  /** First 100 characters of the comment; null if none or deleted. */
  commentSnippet: string | null;
  read: boolean;
  createdAt: string;
};

export type UnreadCountResponse = {
  count: number;
};
