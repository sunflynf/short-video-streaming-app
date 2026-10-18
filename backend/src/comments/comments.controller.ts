import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type { CommentDto, Paginated } from '@app/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { PaginationQueryDto } from '../common/pagination.js';
import { Limit } from '../throttling/limits.js';
import { CommentsService } from './comments.service.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';

@Controller('videos/:id/comments')
export class VideoCommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Limit.comment()
  @Post()
  create(
    @Param('id') videoId: string,
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentDto> {
    return this.comments.create(videoId, actor, dto);
  }

  @Public()
  @Get()
  list(
    @Param('id') videoId: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() viewer?: AuthUser,
  ): Promise<Paginated<CommentDto>> {
    return this.comments.list(videoId, query, viewer);
  }
}

@Controller('comments/:id')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Public()
  @Get('replies')
  replies(
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() viewer?: AuthUser,
  ): Promise<Paginated<CommentDto>> {
    return this.comments.replies(id, query, viewer);
  }

  @Delete()
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<void> {
    return this.comments.remove(id, actor);
  }
}
