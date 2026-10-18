export type Role = 'USER' | 'ADMIN';

/** Compact user shape embedded in lists, videos, comments and notifications. */
export type UserSummary = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type UserProfile = UserSummary & {
  bio: string | null;
  followerCount: number;
  followingCount: number;
  videoCount: number;
  /** null when the request is anonymous or the profile is the viewer's own. */
  isFollowing: boolean | null;
  /** Whether the viewer has blocked this user; null when anonymous or for your own profile. */
  blockedByMe: boolean | null;
  createdAt: string;
};

/** The signed-in user's own profile (`GET /auth/me`, auth responses). */
export type MeProfile = UserProfile & {
  email: string;
  role: Role;
};

export type UpdateUserRequest = {
  displayName?: string | null;
  bio?: string | null;
  username?: string;
  avatarUrl?: string | null;
};

export type FollowResponse = {
  following: boolean;
};

export const AVATAR_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AvatarContentType = (typeof AVATAR_CONTENT_TYPES)[number];
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export type AvatarUploadRequest = {
  contentType: AvatarContentType;
  /** Exact size in bytes; the presigned URL only accepts this length. */
  contentLength: number;
};

export type AvatarUploadResponse = {
  /** PUT the image here with the same Content-Type and Content-Length. Expires in 5 minutes. */
  uploadUrl: string;
  /** Then save this as `avatarUrl` with PATCH /users/:id. */
  publicUrl: string;
};
