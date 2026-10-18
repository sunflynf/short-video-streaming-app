import type { FeedTab } from '@app/shared';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.js';

export class FeedQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['foryou', 'following'])
  tab: FeedTab = 'foryou';
}
