import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AuthResponse, MeProfile } from '@app/shared';
import * as argon2 from 'argon2';
import type { Env } from '../config/env.js';
import type { Role } from '../generated/prisma/client.js';
import { BansService } from '../moderation/bans.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { meProfileSelect, toMeProfile } from '../users/user-mapper.js';
import type { LoginDto, ResetPasswordDto, SignupDto } from './dto/auth.dto.js';
import { generateRefreshToken, hashRefreshToken } from './refresh-token.js';
import type { AccessTokenPayload } from './strategies/jwt.strategy.js';

const RESET_PURPOSE = 'password-reset';
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /** Verified against when the email is unknown, so both failure paths take the same time. */
  private readonly dummyHash = argon2.hash('timing-equalizer');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly bans: BansService,
  ) {}

  async signup(dto: SignupDto): Promise<AuthResponse> {
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        passwordHash: await argon2.hash(dto.password),
      },
      select: meProfileSelect,
    });
    return this.issueTokens(toMeProfile(user));
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { ...meProfileSelect, passwordHash: true },
    });
    const valid = await argon2.verify(user?.passwordHash ?? (await this.dummyHash), dto.password);
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    await this.assertNotBanned(user.id);
    return this.issueTokens(toMeProfile(user));
  }

  /**
   * Rotates the refresh token. Presenting a token that was already rotated or revoked
   * means it may have been stolen, so every session of that user is revoked.
   */
  async refresh(refreshToken: string): Promise<AuthResponse> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(refreshToken) },
    });
    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    if (stored.revokedAt) {
      await this.revokeAll(stored.userId);
      this.logger.warn(`Refresh token reuse detected for user ${stored.userId}`);
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (stored.expiresAt <= new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Conditional update so two concurrent refreshes with the same token can't both win.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!count) {
      await this.revokeAll(stored.userId);
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
      select: meProfileSelect,
    });
    if (!user) throw new UnauthorizedException('Invalid refresh token');
    await this.assertNotBanned(user.id);
    return this.issueTokens(toMeProfile(user));
  }

  /** Idempotent: unknown or already revoked tokens are ignored. */
  async logout(userId: string, refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, tokenHash: hashRefreshToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Always succeeds so the endpoint can't be used to discover accounts.
   * Until an email provider is wired up (Phase 7), the token is logged outside production.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });
    if (!user) return;
    const token = await this.jwt.signAsync(
      { sub: user.id, purpose: RESET_PURPOSE },
      {
        secret: this.resetSecret(user.passwordHash),
        expiresIn: this.config.get('PASSWORD_RESET_TTL_SECONDS', { infer: true }),
      },
    );
    if (this.config.get('NODE_ENV', { infer: true }) !== 'production') {
      this.logger.log(`Password reset token for ${email}: ${token}`);
    }
  }

  /** The reset token is signed with the current password hash, so it stops working once used. */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const invalid = new BadRequestException('Invalid or expired reset token');
    const decoded: unknown = this.jwt.decode(dto.token);
    const sub =
      decoded && typeof decoded === 'object' && 'sub' in decoded ? decoded.sub : undefined;
    if (typeof sub !== 'string') throw invalid;

    const user = await this.prisma.user.findUnique({
      where: { id: sub },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw invalid;
    try {
      const payload = await this.jwt.verifyAsync<{ purpose?: string }>(dto.token, {
        secret: this.resetSecret(user.passwordHash),
        algorithms: ['HS256'],
      });
      if (payload.purpose !== RESET_PURPOSE) throw invalid;
    } catch {
      throw invalid;
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await argon2.hash(dto.password) },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private async issueTokens(user: MeProfile): Promise<AuthResponse> {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role as Role };
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = generateRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(
          Date.now() + this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * DAY_MS,
        ),
      },
    });
    return { accessToken, refreshToken, user };
  }

  private async assertNotBanned(userId: string): Promise<void> {
    if (await this.bans.isBanned(userId)) {
      throw new ForbiddenException('Your account has been suspended');
    }
  }

  private async revokeAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private resetSecret(passwordHash: string): string {
    return `${this.config.get('JWT_ACCESS_SECRET', { infer: true })}:${passwordHash}`;
  }
}
