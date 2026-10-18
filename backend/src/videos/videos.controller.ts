import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Query } from '@nestjs/common';
import type { Paginated, VideoDto } from '@app/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { PaginationQueryDto } from '../common/pagination.js';
import { UpdateVideoDto } from './dto/update-video.dto.js';
import { VideosService } from './videos.service.js';

@Controller('videos')
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Public()
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() viewer?: AuthUser): Promise<VideoDto> {
    return this.videos.get(id, viewer);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
    @Body() dto: UpdateVideoDto,
  ): Promise<VideoDto> {
    return this.videos.update(id, actor, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<void> {
    return this.videos.remove(id, actor);
  }
}

@Controller('users/:id/videos')
export class UserVideosController {
  constructor(private readonly videos: VideosService) {}

  @Public()
  @Get()
  list(@Param('id') id: string, @Query() query: PaginationQueryDto): Promise<Paginated<VideoDto>> {
    return this.videos.listByAuthor(id, query);
  }
}
