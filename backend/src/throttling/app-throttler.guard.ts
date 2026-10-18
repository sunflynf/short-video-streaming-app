import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthUser } from '../common/auth-user.js';

/**
 * Limits per signed-in user (so users behind one NAT don't share a budget), otherwise per IP.
 * Login is keyed by IP + email, so guessing one account's password is capped without
 * locking out everyone on the same network.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as unknown as Request;
    const user = request.user as AuthUser | undefined;
    if (user) return `u:${user.id}`;
    const email = (request.body as { email?: unknown } | undefined)?.email;
    if (request.path.endsWith('/auth/login') && typeof email === 'string') {
      return `ip:${request.ip}:${email.trim().toLowerCase()}`;
    }
    return `ip:${request.ip}`;
  }
}
