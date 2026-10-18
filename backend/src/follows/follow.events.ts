export const FOLLOW_CREATED = 'follow.created';

export type FollowCreatedEvent = {
  followerId: string;
  followingId: string;
};
