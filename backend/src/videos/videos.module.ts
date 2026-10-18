import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { UsersModule } from '../users/users.module.js';
import { UserVideosController, VideosController } from './videos.controller.js';
import { VideosService } from './videos.service.js';

@Module({
  imports: [MediaModule, UsersModule],
  controllers: [VideosController, UserVideosController],
  providers: [VideosService],
})
export class VideosModule {}
