import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { AuthUser } from '../common/auth-user.js';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator.js';

/**
 * Global guard: every route needs a valid access token unless marked @Public().
 * Public routes still pick up the user from a valid token (e.g. for `isFollowing`).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override handleRequest<TUser = AuthUser>(
    err: unknown,
    user: TUser | false,
    _info: unknown,
    context: ExecutionContext,
  ): TUser {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return (user || undefined) as TUser;
    if (err || !user) throw new UnauthorizedException();
    return user;
  }
}
