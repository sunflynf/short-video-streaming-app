import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../common/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class BansService {
  constructor(private readonly prisma: PrismaService) {}

  /** Bans take effect on the next write (BannedGuard) and end every session at the next refresh. */
  async ban(userId: string, admin: AuthUser): Promise<void> {
    if (userId === admin.id) throw new BadRequestException('You can’t ban yourself');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'ADMIN') throw new BadRequestException('Admins can’t be banned');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { bannedAt: new Date() } }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async unban(userId: string): Promise<void> {
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId },
      data: { bannedAt: null },
    });
    if (!count) throw new NotFoundException('User not found');
  }

  async isBanned(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { bannedAt: true },
    });
    return !!user?.bannedAt;
  }
}
