import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { MeProfile, UserProfile } from '@app/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { isOwnAvatarUrl } from '../avatars/avatar-key.js';
import { AvatarsService } from '../avatars/avatars.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import { meProfileSelect, toMeProfile, toUserProfile, userProfileSelect } from './user-mapper.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly avatars: AvatarsService,
  ) {}

  async getProfile(where: Prisma.UserWhereUniqueInput, viewer?: AuthUser): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({ where, select: userProfileSelect });
    if (!user) throw new NotFoundException('User not found');
    const [isFollowing, blockedByMe] = await Promise.all([
      this.isFollowing(viewer, user.id),
      this.blockedByViewer(viewer, user.id),
    ]);
    return toUserProfile(user, isFollowing, blockedByMe);
  }

  private async blockedByViewer(
    viewer: AuthUser | undefined,
    userId: string,
  ): Promise<boolean | null> {
    if (!viewer || viewer.id === userId) return null;
    const count = await this.prisma.block.count({
      where: { blockerId: viewer.id, blockedId: userId },
    });
    return count > 0;
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
    // With R2 configured, avatars must come from our own upload flow (no third-party URLs).
    const base = this.avatars.publicBaseUrl;
    if (dto.avatarUrl && base && this.avatars.enabled && !isOwnAvatarUrl(dto.avatarUrl, base)) {
      throw new BadRequestException('avatarUrl must come from POST /users/me/avatar-upload-url');
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
