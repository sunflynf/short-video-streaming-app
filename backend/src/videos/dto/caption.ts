import { CAPTION_MAX_LENGTH } from '@app/shared';
import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Optional caption: trimmed, blank becomes null, at most CAPTION_MAX_LENGTH characters. */
export const CaptionField = () =>
  applyDecorators(
    IsOptional(),
    Transform(({ value }) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    }),
    IsString(),
    MaxLength(CAPTION_MAX_LENGTH),
  );
