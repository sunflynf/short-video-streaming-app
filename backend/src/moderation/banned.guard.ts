import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../common/auth-user.js';
import { BansService } from './bans.service.js';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// Banned users may still sign out and delete their account.
const ALWAYS_ALLOWED = [/\/auth\/logout$/, /\/users\/me$/];

/** Global: banned users can read, but every write returns 403. One PK lookup per write. */
@Injectable()
export class BannedGuard implements CanActivate {
  constructor(private readonly bans: BansService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user as AuthUser | undefined;
    if (!user || READ_METHODS.has(req.method)) return true;
    if (ALWAYS_ALLOWED.some((pattern) => pattern.test(req.path))) return true;
    if (await this.bans.isBanned(user.id)) {
      throw new ForbiddenException('Your account has been suspended');
    }
    return true;
  }
}
