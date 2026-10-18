import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { AuthResponse, MeProfile } from '@app/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Limit } from '../throttling/limits.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  ResetPasswordDto,
  SignupDto,
} from './dto/auth.dto.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @Limit.signup()
  @Post('signup')
  signup(@Body() dto: SignupDto): Promise<AuthResponse> {
    return this.auth.signup(dto);
  }

  @Public()
  @Limit.login()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto): Promise<AuthResponse> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  logout(@CurrentUser() user: AuthUser, @Body() dto: RefreshDto): Promise<void> {
    return this.auth.logout(user.id, dto.refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<MeProfile> {
    return this.users.getMe(user.id);
  }

  @Public()
  @Limit.passwordReset()
  @Post('forgot-password')
  @HttpCode(204)
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Limit.passwordReset()
  @Post('reset-password')
  @HttpCode(204)
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.auth.resetPassword(dto);
  }
}
