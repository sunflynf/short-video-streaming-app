import { Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type { Paginated, UserSummary } from '@app/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PaginationQueryDto } from '../common/pagination.js';
import { Limit } from '../throttling/limits.js';
import { UsersService } from '../users/users.service.js';
import { BlocksService } from './blocks.service.js';

@Controller('users')
export class BlocksController {
  constructor(
    private readonly blocks: BlocksService,
    private readonly users: UsersService,
  ) {}

  @Get('me/blocks')
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<UserSummary>> {
    return this.blocks.list(user.id, query);
  }

  @Limit.follow()
  @Post(':id/block')
  @HttpCode(204)
  async block(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<void> {
    await this.users.assertExists(id);
    await this.blocks.block(user.id, id);
  }

  @Limit.follow()
  @Delete(':id/block')
  @HttpCode(204)
  unblock(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<void> {
    return this.blocks.unblock(user.id, id);
  }
}
