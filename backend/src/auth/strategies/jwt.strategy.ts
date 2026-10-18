import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Role } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../common/auth-user.js';
import type { Env } from '../../config/env.js';

export type AccessTokenPayload = {
  sub: string;
  role: Role;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
      algorithms: ['HS256'],
    });
  }

  validate(payload: AccessTokenPayload): AuthUser {
    return { id: payload.sub, role: payload.role };
  }
}
