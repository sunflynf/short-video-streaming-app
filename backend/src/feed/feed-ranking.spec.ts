import { feedScore, formatFeedCursor, isQualifiedView, parseFeedCursor } from './feed-ranking.js';

const now = new Date('2026-10-18T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600 * 1000);
const video = (likes: number, hours: number, comments = 0, shares = 0) => ({
  likeCount: likes,
  commentCount: comments,
  shareCount: shares,
  publishedAt: hoursAgo(hours),
});

describe('feedScore', () => {
  it('ranks a fresh video above an equally engaged older one', () => {
    expect(feedScore(video(10, 1), now)).toBeGreaterThan(feedScore(video(10, 48), now));
  });

  it('lets strong engagement beat recency', () => {
    expect(feedScore(video(500, 24), now)).toBeGreaterThan(feedScore(video(0, 0), now));
  });

  it('weights shares over comments over likes', () => {
    const base = feedScore(video(0, 5), now);
    const like = feedScore(video(1, 5), now) - base;
    const comment = feedScore(video(0, 5, 1), now) - base;
    const share = feedScore(video(0, 5, 0, 1), now) - base;
    expect(share).toBeGreaterThan(comment);
    expect(comment).toBeGreaterThan(like);
  });

  it('treats a future publish time as just published', () => {
    expect(feedScore(video(3, -2), now)).toBe(feedScore(video(3, 0), now));
  });
});

describe('feed cursors', () => {
  it('round-trips', () => {
    expect(parseFeedCursor(formatFeedCursor('abcDEF12_-', 40))).toEqual({
      snapshotId: 'abcDEF12_-',
      offset: 40,
    });
  });

  it.each(['', 'abc', 'short:1', 'abcdefgh:', 'abcdefgh:-1', 'abcdefgh:1.5', 'bad id!!:3'])(
    'rejects %j',
    (cursor) => {
      expect(parseFeedCursor(cursor)).toBeNull();
    },
  );
});

describe('isQualifiedView', () => {
  it('needs 3 s on normal clips', () => {
    expect(isQualifiedView(2999, 30)).toBe(false);
    expect(isQualifiedView(3000, 30)).toBe(true);
  });

  it('needs half of very short clips', () => {
    expect(isQualifiedView(1999, 4)).toBe(false);
    expect(isQualifiedView(2000, 4)).toBe(true);
  });

  it('falls back to 3 s when the duration is unknown', () => {
    expect(isQualifiedView(2500, null)).toBe(false);
    expect(isQualifiedView(3000, null)).toBe(true);
  });
});
