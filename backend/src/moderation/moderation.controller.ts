import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type { Paginated, ReportGroupDto } from '@app/shared';
import { CommentsService } from '../comments/comments.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Limit } from '../throttling/limits.js';
import { BansService } from './bans.service.js';
import { ReportDto, ReportListQueryDto, ResolveReportsDto } from './dto/report.dto.js';
import { ReportsService } from './reports.service.js';

@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Limit.comment()
  @Post('videos/:id/report')
  @HttpCode(204)
  reportVideo(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ReportDto,
  ): Promise<void> {
    return this.reports.reportVideo(id, user, dto);
  }

  @Limit.comment()
  @Post('comments/:id/report')
  @HttpCode(204)
  reportComment(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ReportDto,
  ): Promise<void> {
    return this.reports.reportComment(id, user, dto);
  }
}

@Roles('ADMIN')
@Controller('admin')
export class ModerationAdminController {
  constructor(
    private readonly reports: ReportsService,
    private readonly bans: BansService,
    private readonly comments: CommentsService,
  ) {}

  @Get('reports')
  list(@Query() query: ReportListQueryDto): Promise<Paginated<ReportGroupDto>> {
    return this.reports.listOpen(query.cursor, query.limit);
  }

  @Post('reports/resolve')
  @HttpCode(204)
  resolve(@Body() dto: ResolveReportsDto, @CurrentUser() admin: AuthUser): Promise<void> {
    return this.reports.resolve(dto, admin);
  }

  @Post('videos/:id/hide')
  @HttpCode(204)
  hide(@Param('id') id: string): Promise<void> {
    return this.reports.setVideoHidden(id, true);
  }

  @Post('videos/:id/unhide')
  @HttpCode(204)
  unhide(@Param('id') id: string): Promise<void> {
    return this.reports.setVideoHidden(id, false);
  }

  @Post('comments/:id/remove')
  @HttpCode(204)
  removeComment(@Param('id') id: string, @CurrentUser() admin: AuthUser): Promise<void> {
    return this.comments.remove(id, admin);
  }

  @Post('users/:id/ban')
  @HttpCode(204)
  ban(@Param('id') id: string, @CurrentUser() admin: AuthUser): Promise<void> {
    return this.bans.ban(id, admin);
  }

  @Post('users/:id/unban')
  @HttpCode(204)
  unban(@Param('id') id: string): Promise<void> {
    return this.bans.unban(id);
  }
}
