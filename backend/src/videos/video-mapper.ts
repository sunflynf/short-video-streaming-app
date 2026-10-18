import type { VideoDto } from '@app/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { MediaProvider } from '../media/media-provider.js';
import { toUserSummary, userSummarySelect } from '../users/user-mapper.js';

export const videoSelect = {
  id: true,
  authorId: true,
  caption: true,
  status: true,
  muxPlaybackId: true,
  durationSec: true,
  aspectRatio: true,
  likeCount: true,
  commentCount: true,
  shareCount: true,
  viewCount: true,
  hidden: true,
  publishedAt: true,
  createdAt: true,
  author: { select: userSummarySelect },
} satisfies Prisma.VideoSelect;

export type VideoRow = Prisma.VideoGetPayload<{ select: typeof videoSelect }>;

export function toVideoDto(
  row: VideoRow,
  media: MediaProvider,
  likedByMe = false,
  followingAuthor = false,
): VideoDto {
  const ready = row.status === 'READY' && row.muxPlaybackId;
  return {
    id: row.id,
    caption: row.caption,
    status: row.status,
    playbackUrl: ready ? media.playbackUrl(row.muxPlaybackId!) : null,
    thumbnailUrl: ready ? media.thumbnailUrl(row.muxPlaybackId!) : null,
    durationSec: row.durationSec,
    aspectRatio: row.aspectRatio,
    likeCount: row.likeCount,
    commentCount: row.commentCount,
    shareCount: row.shareCount,
    viewCount: row.viewCount,
    likedByMe,
    followingAuthor,
    author: toUserSummary(row.author),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
