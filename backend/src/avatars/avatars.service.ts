import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AvatarUploadResponse } from '@app/shared';
import type { Env } from '../config/env.js';
import { avatarKey } from './avatar-key.js';
import type { AvatarUploadDto } from './dto/avatar-upload.dto.js';

const UPLOAD_URL_TTL_SEC = 5 * 60;

/** Presigned direct uploads to Cloudflare R2 (S3-compatible). Signing is local; no network call. */
@Injectable()
export class AvatarsService {
  private readonly client?: S3Client;
  private readonly bucket?: string;
  readonly publicBaseUrl?: string;

  constructor(config: ConfigService<Env, true>) {
    const accountId = config.get('R2_ACCOUNT_ID', { infer: true });
    const accessKeyId = config.get('R2_ACCESS_KEY_ID', { infer: true });
    const secretAccessKey = config.get('R2_SECRET_ACCESS_KEY', { infer: true });
    this.bucket = config.get('R2_BUCKET', { infer: true });
    this.publicBaseUrl = config.get('R2_PUBLIC_URL', { infer: true })?.replace(/\/+$/, '');
    if (accountId && accessKeyId && secretAccessKey && this.bucket && this.publicBaseUrl) {
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      });
    }
  }

  get enabled(): boolean {
    return !!this.client;
  }

  async createUploadUrl(userId: string, dto: AvatarUploadDto): Promise<AvatarUploadResponse> {
    if (!this.client || !this.bucket || !this.publicBaseUrl) {
      throw new ServiceUnavailableException('Avatar uploads are not configured');
    }
    const key = avatarKey(userId, dto.contentType);
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: dto.contentType,
        ContentLength: dto.contentLength,
      }),
      // Sign the headers too, so the URL only accepts this exact type and size.
      {
        expiresIn: UPLOAD_URL_TTL_SEC,
        signableHeaders: new Set(['content-type', 'content-length']),
      },
    );
    return { uploadUrl, publicUrl: `${this.publicBaseUrl}/${key}` };
  }
}
