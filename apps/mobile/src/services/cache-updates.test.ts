import type { Paginated, UserProfile, VideoDto } from '@app/shared';
import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import {
  adjustCommentCount,
  restoreSnapshot,
  setFollowing,
  setVideoLiked,
  snapshotVideoCaches,
} from './cache-updates';

const video = (id: string, authorId: string, overrides: Partial<VideoDto> = {}): VideoDto => ({
  id,
  caption: null,
  status: 'READY',
  playbackUrl: null,
  thumbnailUrl: null,
  durationSec: 10,
  aspectRatio: '9:16',
  likeCount: 5,
  commentCount: 1,
  shareCount: 0,
  likedByMe: false,
  followingAuthor: false,
  author: { id: authorId, username: authorId, displayName: null, avatarUrl: null },
  publishedAt: null,
  createdAt: '2026-10-18T00:00:00.000Z',
  ...overrides,
});

const pages = (...lists: VideoDto[][]): InfiniteData<Paginated<VideoDto>> => ({
  pages: lists.map((items) => ({ items, nextCursor: null })),
  pageParams: lists.map(() => undefined),
});

const items = (qc: QueryClient, key: unknown[]) =>
  qc.getQueryData<InfiniteData<Paginated<VideoDto>>>(key)!.pages.flatMap((p) => p.items);

describe('cache updates', () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = new QueryClient();
    qc.setQueryData(
      ['feed', 'foryou'],
      pages([video('v1', 'ben'), video('v2', 'cat')], [video('v3', 'ben')]),
    );
    qc.setQueryData(['userVideos', 'ben'], pages([video('v1', 'ben'), video('v3', 'ben')]));
    qc.setQueryData(['video', 'v1'], video('v1', 'ben'));
    qc.setQueryData<UserProfile>(['user', 'ben'], {
      id: 'ben',
      username: 'ben',
      displayName: null,
      avatarUrl: null,
      bio: null,
      followerCount: 10,
      followingCount: 0,
      videoCount: 2,
      isFollowing: false,
      createdAt: '2026-10-18T00:00:00.000Z',
    });
  });

  it('likes a video everywhere it is cached', () => {
    setVideoLiked(qc, 'v1', true);
    expect(items(qc, ['feed', 'foryou'])[0]).toMatchObject({ likedByMe: true, likeCount: 6 });
    expect(items(qc, ['userVideos', 'ben'])[0]).toMatchObject({ likedByMe: true, likeCount: 6 });
    expect(qc.getQueryData(['video', 'v1'])).toMatchObject({ likedByMe: true, likeCount: 6 });
    expect(items(qc, ['feed', 'foryou'])[1]).toMatchObject({ likedByMe: false, likeCount: 5 });
  });

  it('does not double count repeated likes and uses the server count when given', () => {
    setVideoLiked(qc, 'v1', true);
    setVideoLiked(qc, 'v1', true);
    expect(qc.getQueryData(['video', 'v1'])).toMatchObject({ likeCount: 6 });
    setVideoLiked(qc, 'v1', false, 42);
    expect(qc.getQueryData(['video', 'v1'])).toMatchObject({ likedByMe: false, likeCount: 42 });
  });

  it('marks every video by a followed author and updates the profile', () => {
    setFollowing(qc, 'ben', true);
    expect(items(qc, ['feed', 'foryou']).map((v) => v.followingAuthor)).toEqual([
      true,
      false,
      true,
    ]);
    expect(qc.getQueryData(['user', 'ben'])).toMatchObject({
      isFollowing: true,
      followerCount: 11,
    });
    setFollowing(qc, 'ben', true);
    expect(qc.getQueryData(['user', 'ben'])).toMatchObject({ followerCount: 11 });
  });

  it('adjusts comment counts', () => {
    adjustCommentCount(qc, 'v3', 1);
    expect(items(qc, ['feed', 'foryou'])[2]!.commentCount).toBe(2);
  });

  it('rolls back to a snapshot', () => {
    const snapshot = snapshotVideoCaches(qc);
    setVideoLiked(qc, 'v1', true);
    setFollowing(qc, 'ben', true);
    restoreSnapshot(qc, snapshot);
    expect(qc.getQueryData(['video', 'v1'])).toMatchObject({ likedByMe: false, likeCount: 5 });
    expect(qc.getQueryData(['user', 'ben'])).toMatchObject({
      isFollowing: false,
      followerCount: 10,
    });
  });
});
