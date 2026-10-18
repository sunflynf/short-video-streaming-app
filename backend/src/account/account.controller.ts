import { Body, Controller, Delete, Get, HttpCode } from '@nestjs/common';
import type { CreatorStats, DeleteAccountRequest } from '@app/shared';
import { IsString, MaxLength } from 'class-validator';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Limit } from '../throttling/limits.js';
import { AccountService } from './account.service.js';

class DeleteAccountDto implements DeleteAccountRequest {
  @IsString()
  @MaxLength(128)
  password!: string;
}

@Controller('users/me')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get('stats')
  stats(@CurrentUser() user: AuthUser): Promise<CreatorStats> {
    return this.account.stats(user.id);
  }

  /** Permanent. The password is asked again as confirmation (and to slow down token theft). */
  @Limit.login()
  @Delete()
  @HttpCode(204)
  delete(@CurrentUser() user: AuthUser, @Body() dto: DeleteAccountDto): Promise<void> {
    return this.account.deleteAccount(user.id, dto.password);
  }
}
