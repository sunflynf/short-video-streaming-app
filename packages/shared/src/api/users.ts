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
