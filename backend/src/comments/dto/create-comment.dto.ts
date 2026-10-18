import { COMMENT_MAX_LENGTH, type CreateCommentRequest } from '@app/shared';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { sanitizeCommentBody } from '../comment-body.js';

export class CreateCommentDto implements CreateCommentRequest {
  @Transform(({ value }) => (typeof value === 'string' ? sanitizeCommentBody(value) : value))
  @IsString()
  @IsNotEmpty({ message: 'body must not be empty' })
  @MaxLength(COMMENT_MAX_LENGTH)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  parentId?: string;
}
