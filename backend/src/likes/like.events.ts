export const LIKE_CREATED = 'like.created';

export type LikeCreatedEvent = {
  actorId: string;
  videoId: string;
  authorId: string;
};
