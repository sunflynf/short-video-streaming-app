import type { RecordViewRequest } from '@app/shared';
import { IsInt, Max, Min } from 'class-validator';

export class RecordViewDto implements RecordViewRequest {
  @IsInt()
  @Min(0)
  @Max(60 * 60 * 1000)
  watchedMs!: number;
}
