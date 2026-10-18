import { Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type { LikeResponse, Paginated, VideoDto } from '@app/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PaginationQueryDto } from '../common/pagination.js';
import { Limit } from '../throttling/limits.js';
import { LikesService } from './likes.service.js';

@Controller('videos/:id/like')
export class LikesController {
  constructor(private readonly likes: LikesService) {}

  @Limit.engagement()
  @Post()
  @HttpCode(200)
  like(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<LikeResponse> {
    return this.likes.like(user.id, id);
  }

  @Limit.engagement()
  @Delete()
  unlike(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<LikeResponse> {
    return this.likes.unlike(user.id, id);
  }
}

@Controller('users/:id/liked')
export class LikedVideosController {
  constructor(private readonly likes: LikesService) {}

  @Get()
  list(
    @Param('id') id: string,
    @CurrentUser() viewer: AuthUser,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<VideoDto>> {
    return this.likes.listLiked(id, viewer, query);
  }
}
