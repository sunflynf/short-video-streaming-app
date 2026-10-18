import { REPORT_REASONS, type ReportReason, type ReportRequest } from '@app/shared';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.js';

export class ReportDto implements ReportRequest {
  @IsIn(REPORT_REASONS)
  reason!: ReportReason;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsString()
  @MaxLength(500)
  details?: string;
}

export class ResolveReportsDto {
  @ValidateIf((o: ResolveReportsDto) => !o.commentId)
  @IsString()
  @MaxLength(64)
  videoId?: string;

  @ValidateIf((o: ResolveReportsDto) => !o.videoId)
  @IsString()
  @MaxLength(64)
  commentId?: string;
}

export class ReportListQueryDto extends PaginationQueryDto {}
