import { Module } from '@nestjs/common';
import { allQueuesProvider, queueReaders } from '../common/queues.js';
import { AdminController } from './admin.controller.js';

@Module({
  imports: [queueReaders()],
  controllers: [AdminController],
  providers: [allQueuesProvider],
})
export class AdminModule {}
