import { createHash } from 'node:crypto';
import type { AuthUser } from './auth-user.js';

/**
 * Identifies a viewer for per-viewer debouncing (views, shares): the user id when signed in,
 * otherwise a hash of the IP so raw addresses never reach Redis.
 */
export function viewerKey(viewer: AuthUser | undefined, ip: string | undefined): string {
  if (viewer) return `u:${viewer.id}`;
  return `ip:${createHash('sha256')
    .update(ip ?? 'unknown')
    .digest('hex')
    .slice(0, 32)}`;
}
