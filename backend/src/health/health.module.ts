import { Module } from '@nestjs/common';
import { allQueuesProvider, queueReaders } from '../common/queues.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [queueReaders()],
  controllers: [HealthController],
  providers: [allQueuesProvider],
})
export class HealthModule {}
