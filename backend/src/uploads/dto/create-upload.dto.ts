import type { CreateUploadRequest } from '@app/shared';
import { CaptionField } from '../../videos/dto/caption.js';

export class CreateUploadDto implements CreateUploadRequest {
  @CaptionField()
  caption?: string;
}
