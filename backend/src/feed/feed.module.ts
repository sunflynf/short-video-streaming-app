import { Module } from '@nestjs/common';
import { VideosModule } from '../videos/videos.module.js';
import { FeedController } from './feed.controller.js';
import { FeedService } from './feed.service.js';
import { SeenStore } from './seen.store.js';
import { ViewsService } from './views.service.js';

@Module({
  imports: [VideosModule],
  controllers: [FeedController],
  providers: [FeedService, ViewsService, SeenStore],
})
export class FeedModule {}
