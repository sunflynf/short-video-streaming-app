import { Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type { FollowResponse, Paginated, UserSummary } from '@app/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { PaginationQueryDto } from '../common/pagination.js';
import { FollowsService } from './follows.service.js';

@Controller('users/:id')
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  @Post('follow')
  @HttpCode(200)
  follow(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<FollowResponse> {
    return this.follows.follow(user.id, id);
  }

  @Delete('follow')
  unfollow(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<FollowResponse> {
    return this.follows.unfollow(user.id, id);
  }

  @Public()
  @Get('followers')
  followers(
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<UserSummary>> {
    return this.follows.followers(id, query);
  }

  @Public()
  @Get('following')
  following(
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<UserSummary>> {
    return this.follows.following(id, query);
  }
}
