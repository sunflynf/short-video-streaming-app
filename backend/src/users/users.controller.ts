import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import type { MeProfile, UserProfile } from '@app/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Public()
  @Get('by-username/:username')
  getByUsername(
    @Param('username') username: string,
    @CurrentUser() viewer?: AuthUser,
  ): Promise<UserProfile> {
    return this.users.getProfile({ username: username.toLowerCase() }, viewer);
  }

  @Public()
  @Get(':id')
  getById(@Param('id') id: string, @CurrentUser() viewer?: AuthUser): Promise<UserProfile> {
    return this.users.getProfile({ id }, viewer);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
    @Body() dto: UpdateUserDto,
  ): Promise<MeProfile> {
    return this.users.update(id, actor, dto);
  }
}
