export type FeedTab = 'foryou' | 'following';

export type LikeResponse = {
  liked: boolean;
  likeCount: number;
};

export type RecordViewRequest = {
  /** How long the clip was actually on screen and playing, in milliseconds. */
  watchedMs: number;
};
