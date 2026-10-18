import type { UpdateVideoRequest } from '@app/shared';
import { CaptionField } from './caption.js';

export class UpdateVideoDto implements UpdateVideoRequest {
  /** Send null or an empty string to clear. */
  @CaptionField()
  caption!: string | null;
}
