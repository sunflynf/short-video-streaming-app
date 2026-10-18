import type { NotificationType } from '../generated/prisma/client.js';

/** What happened, as queued by NotificationsListener. */
export type NotificationTrigger =
  | { kind: 'follow'; followerId: string; followingId: string }
  | { kind: 'like'; actorId: string; videoId: string; authorId: string }
  | {
      kind: 'comment';
      actorId: string;
      videoId: string;
      videoAuthorId: string;
      commentId: string;
      parentAuthorId?: string;
    };

export type PlannedNotification = {
  recipientId: string;
  actorId: string;
  type: NotificationType;
  videoId?: string;
  commentId?: string;
  /** Skip if the recipient already has an unread one from this actor for this target. */
  dedupe: boolean;
};

/** Who gets notified about what. Nobody is ever notified about their own action. */
export function planNotifications(trigger: NotificationTrigger): PlannedNotification[] {
  const plans: PlannedNotification[] = [];
  switch (trigger.kind) {
    case 'follow':
      plans.push({
        recipientId: trigger.followingId,
        actorId: trigger.followerId,
        type: 'FOLLOW',
        dedupe: true,
      });
      break;
    case 'like':
      plans.push({
        recipientId: trigger.authorId,
        actorId: trigger.actorId,
        type: 'LIKE',
        videoId: trigger.videoId,
        dedupe: true,
      });
      break;
    case 'comment': {
      const { actorId, videoId, commentId, videoAuthorId, parentAuthorId } = trigger;
      if (parentAuthorId) {
        plans.push({
          recipientId: parentAuthorId,
          actorId,
          type: 'REPLY',
          videoId,
          commentId,
          dedupe: false,
        });
      }
      // The video author hears about every comment, unless they already got the REPLY.
      if (videoAuthorId !== parentAuthorId) {
        plans.push({
          recipientId: videoAuthorId,
          actorId,
          type: 'COMMENT',
          videoId,
          commentId,
          dedupe: false,
        });
      }
      break;
    }
  }
  return plans.filter((p) => p.recipientId !== p.actorId);
}
