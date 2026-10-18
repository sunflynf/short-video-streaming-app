import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_PATTERN,
  type ForgotPasswordRequest,
  type LoginRequest,
  type RefreshRequest,
  type ResetPasswordRequest,
  type SignupRequest,
} from '@app/shared';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class SignupDto implements SignupRequest {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Matches(USERNAME_PATTERN, {
    message: 'username must be 3-24 characters of a-z, 0-9, underscore or dot',
  })
  username!: string;

  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)
  password!: string;
}

export class LoginDto implements LoginRequest {
  @Transform(normalizeEmail)
  @IsEmail()
  email!: string;

  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}

export class RefreshDto implements RefreshRequest {
  @IsString()
  @MaxLength(256)
  refreshToken!: string;
}

export class ForgotPasswordDto implements ForgotPasswordRequest {
  @Transform(normalizeEmail)
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto implements ResetPasswordRequest {
  @IsString()
  @MaxLength(2048)
  token!: string;

  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)
  password!: string;
}
