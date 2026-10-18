import type { UserSummary } from './users';

export const CAPTION_MAX_LENGTH = 300;

export type VideoStatus = 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED';

export type VideoDto = {
  id: string;
  caption: string | null;
  status: VideoStatus;
  playbackUrl: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  aspectRatio: string | null;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  viewCount: number;
  likedByMe: boolean;
  /** Whether the viewer follows the author (false when anonymous or for your own videos). */
  followingAuthor: boolean;
  author: UserSummary;
  publishedAt: string | null;
  createdAt: string;
};

export type CreateUploadRequest = {
  caption?: string;
};

export type CreateUploadResponse = {
  videoId: string;
  /** Mux direct-upload URL: PUT the file here. Expires after about an hour. */
  uploadUrl: string;
};

export type UpdateVideoRequest = {
  caption: string | null;
};
