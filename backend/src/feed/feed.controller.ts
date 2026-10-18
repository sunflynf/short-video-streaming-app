import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import type { Paginated, VideoDto } from '@app/shared';
import type { Request } from 'express';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { FeedQueryDto } from './dto/feed-query.dto.js';
import { RecordViewDto } from './dto/record-view.dto.js';
import { FeedService } from './feed.service.js';
import { ViewsService } from './views.service.js';

// Registered before VideosModule (see app.module.ts) so `feed` isn't matched as `:id`.
@Controller('videos')
export class FeedController {
  constructor(
    private readonly feed: FeedService,
    private readonly views: ViewsService,
  ) {}

  @Public()
  @Get('feed')
  get(
    @Query() query: FeedQueryDto,
    @CurrentUser() viewer?: AuthUser,
  ): Promise<Paginated<VideoDto>> {
    return query.tab === 'following'
      ? this.feed.following(query, viewer)
      : this.feed.forYou(query, viewer);
  }

  @Public()
  @Post(':id/view')
  @HttpCode(204)
  view(
    @Param('id') id: string,
    @Body() dto: RecordViewDto,
    @Req() req: Request,
    @CurrentUser() viewer?: AuthUser,
  ): Promise<void> {
    return this.views.record(id, dto.watchedMs, viewer, req.ip);
  }
}
