import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { MeProfile, UserProfile } from '@app/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../common/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import { meProfileSelect, toMeProfile, toUserProfile, userProfileSelect } from './user-mapper.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(where: Prisma.UserWhereUniqueInput, viewer?: AuthUser): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({ where, select: userProfileSelect });
    if (!user) throw new NotFoundException('User not found');
    return toUserProfile(user, await this.isFollowing(viewer, user.id));
  }

  async getMe(userId: string): Promise<MeProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: meProfileSelect,
    });
    if (!user) throw new NotFoundException('User not found');
    return toMeProfile(user);
  }

  async update(id: string, actor: AuthUser, dto: UpdateUserDto): Promise<MeProfile> {
    if (actor.id !== id && actor.role !== 'ADMIN') {
      throw new ForbiddenException('You can only edit your own profile');
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        displayName: dto.displayName,
        bio: dto.bio,
        username: dto.username ?? undefined,
        avatarUrl: dto.avatarUrl,
      },
      select: meProfileSelect,
    });
    return toMeProfile(user);
  }

  async assertExists(id: string): Promise<void> {
    const count = await this.prisma.user.count({ where: { id } });
    if (!count) throw new NotFoundException('User not found');
  }

  private async isFollowing(viewer: AuthUser | undefined, userId: string): Promise<boolean | null> {
    if (!viewer || viewer.id === userId) return null;
    const follow = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: viewer.id, followingId: userId } },
      select: { followerId: true },
    });
    return !!follow;
  }
}
