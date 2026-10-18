import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { VideosModule } from '../videos/videos.module.js';
import { LikedVideosController, LikesController } from './likes.controller.js';
import { LikesService } from './likes.service.js';

@Module({
  imports: [UsersModule, VideosModule],
  controllers: [LikesController, LikedVideosController],
  providers: [LikesService],
})
export class LikesModule {}
