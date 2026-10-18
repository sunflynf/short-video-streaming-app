export type HealthStatus = 'ok' | 'error';

export type QueueCounts = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
};

export type HealthResponse = {
  status: HealthStatus;
  db: HealthStatus;
  redis: HealthStatus;
  /** Job backlog per queue; a growing `waiting` count means workers are falling behind. */
  queues?: Record<string, QueueCounts>;
};

export type QueueFailure = {
  id: string;
  name: string;
  failedReason: string;
  attemptsMade: number;
  failedAt: string | null;
};

export type AdminQueuesResponse = {
  queues: {
    name: string;
    counts: QueueCounts & { completed: number };
    recentFailures: QueueFailure[];
  }[];
};
