import { Global, Module } from '@nestjs/common';
import { CommentsModule } from '../comments/comments.module.js';
import { VideosModule } from '../videos/videos.module.js';
import { BansService } from './bans.service.js';
import { ModerationAdminController, ReportsController } from './moderation.controller.js';
import { ReportsService } from './reports.service.js';

/** Global so the auth module's BannedGuard and login checks can use BansService. */
@Global()
@Module({
  imports: [VideosModule, CommentsModule],
  controllers: [ReportsController, ModerationAdminController],
  providers: [ReportsService, BansService],
  exports: [BansService],
})
export class ModerationModule {}
