import {
  Controller,
  HttpCode,
  Inject,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator.js';
import { MEDIA_PROVIDER, type MediaEvent, type MediaProvider } from './media-provider.js';
import { MediaQueue } from './media.queue.js';

@Public()
@Controller('webhooks')
export class MuxWebhookController {
  private readonly logger = new Logger(MuxWebhookController.name);

  constructor(
    @Inject(MEDIA_PROVIDER) private readonly media: MediaProvider,
    private readonly queue: MediaQueue,
  ) {}

  /** Verifies the signature, queues the event and acknowledges immediately. */
  @Post('mux')
  @HttpCode(200)
  async mux(@Req() req: RawBodyRequest<Request>): Promise<{ received: true }> {
    if (!this.media.webhooksEnabled) {
      throw new ServiceUnavailableException('Media webhooks are not configured');
    }
    let event: MediaEvent | null;
    try {
      event = await this.media.verifyWebhook(req.rawBody ?? Buffer.alloc(0), req.headers);
    } catch (err) {
      this.logger.warn(`Rejected Mux webhook: ${err instanceof Error ? err.message : err}`);
      throw new UnauthorizedException('Invalid webhook signature');
    }
    if (event) await this.queue.enqueueEvent(event);
    return { received: true };
  }
}
