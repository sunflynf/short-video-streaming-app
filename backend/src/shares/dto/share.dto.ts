import type { ShareChannel, ShareRequest } from '@app/shared';
import { IsIn, IsOptional } from 'class-validator';

export class ShareDto implements ShareRequest {
  @IsOptional()
  @IsIn(['copy_link', 'system', 'other'])
  channel?: ShareChannel;
}
