import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Queue } from 'bullmq';
import { COMMENT_CREATED, type CommentCreatedEvent } from '../comments/comment.events.js';
import { FOLLOW_CREATED, type FollowCreatedEvent } from '../follows/follow.events.js';
import { LIKE_CREATED, type LikeCreatedEvent } from '../likes/like.events.js';
import { NOTIFICATIONS_QUEUE } from './notifications.constants.js';
import type { NotificationTrigger } from './plan-notifications.js';

/**
 * Moves domain events onto a queue so writing notifications never slows the request.
 * Emitters use emitAsync, so the job is queued before the response is sent.
 */
@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(@InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue) {}

  @OnEvent(FOLLOW_CREATED)
  onFollow(event: FollowCreatedEvent): Promise<void> {
    return this.enqueue({ kind: 'follow', ...event });
  }

  @OnEvent(LIKE_CREATED)
  onLike(event: LikeCreatedEvent): Promise<void> {
    return this.enqueue({ kind: 'like', ...event });
  }

  @OnEvent(COMMENT_CREATED)
  onComment(event: CommentCreatedEvent): Promise<void> {
    return this.enqueue({ kind: 'comment', ...event });
  }

  private async enqueue(trigger: NotificationTrigger): Promise<void> {
    try {
      await this.queue.add(trigger.kind, trigger);
    } catch (err) {
      // A lost notification shouldn't fail the like/follow/comment that caused it.
      this.logger.error(`Could not queue ${trigger.kind} notification`, err);
    }
  }
}
