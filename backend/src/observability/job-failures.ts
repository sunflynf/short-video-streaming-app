import type { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { reportError } from './report-error.js';

/** Logs every failed attempt; reports to Sentry only once retries are exhausted. */
export function onJobFailed(
  logger: Logger,
  queue: string,
  job: Job | undefined,
  error: Error,
): void {
  if (!job) return;
  const attempts = job.opts.attempts ?? 1;
  const final = job.attemptsMade >= attempts;
  const message = `${queue} job ${job.name} (${job.id}) failed, attempt ${job.attemptsMade}/${attempts}: ${error.message}`;
  if (!final) {
    logger.warn(message);
    return;
  }
  logger.error(message, error.stack);
  reportError(error, { tags: { queue, job: job.name } });
}
