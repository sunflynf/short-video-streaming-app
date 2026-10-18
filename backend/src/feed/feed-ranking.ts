const HOUR_MS = 60 * 60 * 1000;

export type RankableVideo = {
  likeCount: number;
  commentCount: number;
  shareCount: number;
  publishedAt: Date;
};

/**
 * Reference implementation of the For You ranking, which runs in SQL
 * (FeedService.rankedIds). Engagement decays with age: (e + 1) / (hours + 2)^1.5.
 */
export function feedScore(video: RankableVideo, now: Date): number {
  const hours = Math.max(0, (now.getTime() - video.publishedAt.getTime()) / HOUR_MS);
  const engagement = video.likeCount * 2 + video.commentCount * 3 + video.shareCount * 4 + 1;
  return engagement / Math.pow(hours + 2, 1.5);
}

const SNAPSHOT_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Feed cursors point into a cached snapshot of ranked ids: `<snapshotId>:<offset>`. */
export function formatFeedCursor(snapshotId: string, offset: number): string {
  return `${snapshotId}:${offset}`;
}

export function parseFeedCursor(cursor: string): { snapshotId: string; offset: number } | null {
  const sep = cursor.lastIndexOf(':');
  if (sep <= 0) return null;
  const snapshotId = cursor.slice(0, sep);
  const offsetText = cursor.slice(sep + 1);
  if (!SNAPSHOT_ID.test(snapshotId) || !/^\d{1,6}$/.test(offsetText)) return null;
  return { snapshotId, offset: Number(offsetText) };
}

/** A view counts once the clip played for 3 s, or for half of a clip shorter than 6 s. */
export function isQualifiedView(watchedMs: number, durationSec: number | null): boolean {
  const threshold = durationSec ? Math.min(3000, durationSec * 500) : 3000;
  return watchedMs >= threshold;
}
