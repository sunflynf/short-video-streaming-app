import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CreateUploadResponse } from '@app/shared';
import type { Env } from '../config/env.js';
import { MEDIA_PROVIDER, type MediaProvider } from '../media/media-provider.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateUploadDto } from './dto/create-upload.dto.js';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(MEDIA_PROVIDER) private readonly media: MediaProvider,
  ) {}

  /** Creates the Video row first so its id can travel to the provider as passthrough. */
  async createUpload(authorId: string, dto: CreateUploadDto): Promise<CreateUploadResponse> {
    if (!this.media.uploadsEnabled) {
      throw new ServiceUnavailableException('Video uploads are not configured');
    }
    await this.assertWithinLimits(authorId);

    const video = await this.prisma.video.create({
      data: { authorId, caption: dto.caption ?? null },
      select: { id: true },
    });
    try {
      const { uploadId, uploadUrl } = await this.media.createDirectUpload({
        passthrough: video.id,
      });
      await this.prisma.video.update({ where: { id: video.id }, data: { muxUploadId: uploadId } });
      return { videoId: video.id, uploadUrl };
    } catch (err) {
      this.logger.error(`Could not create a direct upload for video ${video.id}`, err);
      await this.prisma.video.delete({ where: { id: video.id } });
      throw new BadGatewayException('Could not start the upload, please try again');
    }
  }

  private async assertWithinLimits(authorId: string): Promise<void> {
    const [active, today] = await Promise.all([
      this.prisma.video.count({
        where: { authorId, status: { in: ['UPLOADING', 'PROCESSING'] } },
      }),
      this.prisma.video.count({
        where: { authorId, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
      }),
    ]);
    if (active >= this.config.get('MAX_ACTIVE_UPLOADS', { infer: true })) {
      throw new HttpException(
        'Too many uploads in progress, wait for one to finish',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (today >= this.config.get('MAX_DAILY_UPLOADS', { infer: true })) {
      throw new HttpException('Daily upload limit reached', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
