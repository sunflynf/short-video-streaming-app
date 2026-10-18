import { Injectable } from '@nestjs/common';
import { MuxProvider } from '../src/media/mux.provider.js';

/**
 * MuxProvider with the network calls replaced by recorders. Webhook signature
 * verification and URL building stay real.
 */
@Injectable()
export class StubMuxProvider extends MuxProvider {
  configured = true;
  failNextUpload = false;
  readonly uploads: string[] = [];
  readonly cancelledUploads: string[] = [];
  readonly deletedAssets: string[] = [];

  override get uploadsEnabled(): boolean {
    return this.configured;
  }

  override async createDirectUpload(opts: { passthrough: string }) {
    if (this.failNextUpload) {
      this.failNextUpload = false;
      throw new Error('Mux is down');
    }
    this.uploads.push(opts.passthrough);
    const uploadId = `up_${opts.passthrough}`;
    return { uploadId, uploadUrl: `https://storage.example.com/upload/${uploadId}` };
  }

  override async cancelUpload(uploadId: string): Promise<void> {
    this.cancelledUploads.push(uploadId);
  }

  override async deleteAsset(assetId: string): Promise<void> {
    this.deletedAssets.push(assetId);
  }

  reset(): void {
    this.configured = true;
    this.failNextUpload = false;
    this.uploads.length = 0;
    this.cancelledUploads.length = 0;
    this.deletedAssets.length = 0;
  }
}
