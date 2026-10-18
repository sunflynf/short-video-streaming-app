import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { FollowsController } from './follows.controller.js';
import { FollowsService } from './follows.service.js';

@Module({
  imports: [UsersModule],
  controllers: [FollowsController],
  providers: [FollowsService],
})
export class FollowsModule {}
