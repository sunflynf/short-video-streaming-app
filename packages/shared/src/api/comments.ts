import type { UserSummary } from './users';

export const COMMENT_MAX_LENGTH = 500;

export type CommentDto = {
  id: string;
  videoId: string;
  /** The top-level comment this replies to. Replies are one level deep. */
  parentId: string | null;
  /** '[deleted]' when `deleted` is true. */
  body: string;
  deleted: boolean;
  replyCount: number;
  author: UserSummary;
  createdAt: string;
};

export type CreateCommentRequest = {
  body: string;
  /** Reply to this comment. Replying to a reply attaches to its top-level comment. */
  parentId?: string;
};

export type ShareChannel = 'copy_link' | 'system' | 'other';

export type ShareRequest = {
  channel?: ShareChannel;
};

export type ShareResponse = {
  shareUrl: string;
};
