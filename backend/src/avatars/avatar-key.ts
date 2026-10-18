import type { AvatarContentType } from '@app/shared';
import { randomBytes } from 'node:crypto';

const EXTENSIONS: Record<AvatarContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** A fresh key per upload, so CDN caches never serve a stale avatar. */
export function avatarKey(userId: string, contentType: AvatarContentType): string {
  return `avatars/${userId}/${randomBytes(9).toString('base64url')}.${EXTENSIONS[contentType]}`;
}

/** True if `url` points into our public avatar space (so users can't set arbitrary image URLs). */
export function isOwnAvatarUrl(url: string, publicBaseUrl: string): boolean {
  const base = publicBaseUrl.replace(/\/+$/, '');
  return url.startsWith(`${base}/avatars/`);
}
