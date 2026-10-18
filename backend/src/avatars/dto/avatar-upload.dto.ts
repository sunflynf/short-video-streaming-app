import {
  AVATAR_CONTENT_TYPES,
  AVATAR_MAX_BYTES,
  type AvatarContentType,
  type AvatarUploadRequest,
} from '@app/shared';
import { IsIn, IsInt, Max, Min } from 'class-validator';

export class AvatarUploadDto implements AvatarUploadRequest {
  @IsIn(AVATAR_CONTENT_TYPES)
  contentType!: AvatarContentType;

  @IsInt()
  @Min(1)
  @Max(AVATAR_MAX_BYTES)
  contentLength!: number;
}
