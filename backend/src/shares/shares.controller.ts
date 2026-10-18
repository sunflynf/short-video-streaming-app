import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import type { ShareResponse } from '@app/shared';
import type { Request, Response } from 'express';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Limit } from '../throttling/limits.js';
import { ShareDto } from './dto/share.dto.js';
import { NOT_FOUND_PAGE } from './share-page.js';
import { SharesService } from './shares.service.js';

@Controller('videos/:id/share')
export class SharesController {
  constructor(private readonly shares: SharesService) {}

  @Public()
  @Limit.engagement()
  @Post()
  @HttpCode(200)
  share(
    @Param('id') id: string,
    // Validated for analytics later; the channel doesn't change behaviour yet.
    @Body() _dto: ShareDto,
    @Req() req: Request,
    @CurrentUser() viewer?: AuthUser,
  ): Promise<ShareResponse> {
    return this.shares.share(id, viewer, req.ip);
  }
}

/** Served at /v/:id, outside the /v1 API prefix (see setup-app.ts). */
@Controller('v')
export class SharePageController {
  constructor(private readonly shares: SharesService) {}

  @Public()
  @Get(':id')
  async page(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const html = await this.shares.landingPage(id);
    res
      .status(html ? 200 : 404)
      .type('html')
      // Override helmet's default CSP: the page shows a Mux thumbnail and inline styles.
      .setHeader(
        'Content-Security-Policy',
        "default-src 'none'; img-src https://image.mux.com; style-src 'unsafe-inline'",
      )
      .send(html ?? NOT_FOUND_PAGE);
  }
}
