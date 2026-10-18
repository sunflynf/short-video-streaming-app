import { BullModule, getQueueToken } from '@nestjs/bullmq';
import type { Provider } from '@nestjs/common';
import type { QueueCounts } from '@app/shared';
import type { Queue } from 'bullmq';
import { MEDIA_QUEUE } from '../media/media.constants.js';
import { NOTIFICATIONS_QUEUE } from '../notifications/notifications.constants.js';

export const QUEUE_NAMES = [MEDIA_QUEUE, NOTIFICATIONS_QUEUE] as const;

/** Read-only handles on every queue, for health and admin endpoints. */
export const ALL_QUEUES = Symbol('ALL_QUEUES');

export const queueReaders = () =>
  BullModule.registerQueue(...QUEUE_NAMES.map((name) => ({ name })));

export const allQueuesProvider: Provider = {
  provide: ALL_QUEUES,
  inject: QUEUE_NAMES.map((name) => getQueueToken(name)),
  useFactory: (...queues: Queue[]) => queues,
};

export async function queueCounts(queue: Queue): Promise<QueueCounts> {
  const c = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
  return {
    waiting: c.waiting ?? 0,
    active: c.active ?? 0,
    delayed: c.delayed ?? 0,
    failed: c.failed ?? 0,
  };
}
