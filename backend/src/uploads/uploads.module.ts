import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { UploadsController } from './uploads.controller.js';
import { UploadsService } from './uploads.service.js';

@Module({
  imports: [MediaModule],
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
