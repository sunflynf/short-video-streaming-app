import { Body, Controller, Post } from '@nestjs/common';
import type { AvatarUploadResponse } from '@app/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { AvatarsService } from './avatars.service.js';
import { AvatarUploadDto } from './dto/avatar-upload.dto.js';

@Controller('users/me/avatar-upload-url')
export class AvatarsController {
  constructor(private readonly avatars: AvatarsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: AvatarUploadDto,
  ): Promise<AvatarUploadResponse> {
    return this.avatars.createUploadUrl(user.id, dto);
  }
}
