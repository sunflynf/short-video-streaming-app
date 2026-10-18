import { Body, Controller, Post } from '@nestjs/common';
import type { CreateUploadResponse } from '@app/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { CreateUploadDto } from './dto/create-upload.dto.js';
import { UploadsService } from './uploads.service.js';

@Controller('videos')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /** Returns a direct-upload URL; the client PUTs the file there, then polls GET /videos/:id. */
  @Post('upload')
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateUploadDto,
  ): Promise<CreateUploadResponse> {
    return this.uploads.createUpload(user.id, dto);
  }
}
