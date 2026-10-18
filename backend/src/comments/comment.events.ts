export const COMMENT_CREATED = 'comment.created';

export type CommentCreatedEvent = {
  actorId: string;
  videoId: string;
  videoAuthorId: string;
  commentId: string;
  /** Author of the comment actually replied to (before flattening), for replies only. */
  parentAuthorId?: string;
};
