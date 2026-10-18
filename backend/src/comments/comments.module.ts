import { Module } from '@nestjs/common';
import { VideosModule } from '../videos/videos.module.js';
import { CommentsController, VideoCommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';

@Module({
  imports: [VideosModule],
  controllers: [VideoCommentsController, CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
