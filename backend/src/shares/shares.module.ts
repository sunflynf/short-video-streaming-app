import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { VideosModule } from '../videos/videos.module.js';
import { SharePageController, SharesController } from './shares.controller.js';
import { SharesService } from './shares.service.js';

@Module({
  imports: [MediaModule, VideosModule],
  controllers: [SharesController, SharePageController],
  providers: [SharesService],
})
export class SharesModule {}
