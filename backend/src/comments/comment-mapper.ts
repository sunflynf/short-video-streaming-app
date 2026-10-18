import type { CommentDto } from '@app/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { toUserSummary, userSummarySelect } from '../users/user-mapper.js';

export const DELETED_BODY = '[deleted]';

export const commentSelect = {
  id: true,
  videoId: true,
  parentId: true,
  body: true,
  replyCount: true,
  deletedAt: true,
  createdAt: true,
  author: { select: userSummarySelect },
} satisfies Prisma.CommentSelect;

type CommentRow = Prisma.CommentGetPayload<{ select: typeof commentSelect }>;

export function toCommentDto(row: CommentRow): CommentDto {
  const deleted = row.deletedAt !== null;
  return {
    id: row.id,
    videoId: row.videoId,
    parentId: row.parentId,
    body: deleted ? DELETED_BODY : row.body,
    deleted,
    replyCount: row.replyCount,
    author: toUserSummary(row.author),
    createdAt: row.createdAt.toISOString(),
  };
}
