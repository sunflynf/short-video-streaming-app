import { Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import type { NotificationDto, Paginated, UnreadCountResponse } from '@app/shared';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PaginationQueryDto } from '../common/pagination.js';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<NotificationDto>> {
    return this.notifications.list(user.id, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser): Promise<UnreadCountResponse> {
    return this.notifications.unreadCount(user.id);
  }

  @Post('read-all')
  @HttpCode(204)
  readAll(@CurrentUser() user: AuthUser): Promise<void> {
    return this.notifications.markAllRead(user.id);
  }

  @Patch(':id/read')
  @HttpCode(204)
  read(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    return this.notifications.markRead(user.id, id);
  }
}
