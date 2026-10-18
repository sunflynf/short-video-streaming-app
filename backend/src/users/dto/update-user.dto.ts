import { USERNAME_PATTERN, type UpdateUserRequest } from '@app/shared';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateUserDto implements UpdateUserRequest {
  /** Send null to clear. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  displayName?: string | null;

  /** Send null to clear. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  bio?: string | null;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Matches(USERNAME_PATTERN, {
    message: 'username must be 3-24 characters of a-z, 0-9, underscore or dot',
  })
  username?: string;

  /** Send null to clear. Phase 5 replaces free-form URLs with an R2 upload flow. */
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  avatarUrl?: string | null;
}
