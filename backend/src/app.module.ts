import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SentryModule } from '@sentry/nestjs/setup';
import { LoggerModule } from 'nestjs-pino';
import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AvatarsModule } from './avatars/avatars.module.js';
import { CommentsModule } from './comments/comments.module.js';
import { validateEnv, type Env } from './config/env.js';
import { FeedModule } from './feed/feed.module.js';
import { FollowsModule } from './follows/follows.module.js';
import { HealthModule } from './health/health.module.js';
import { LikesModule } from './likes/likes.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { loggerParams } from './observability/logging.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { SharesModule } from './shares/shares.module.js';
import { UploadsModule } from './uploads/uploads.module.js';
import { UsersModule } from './users/users.module.js';
import { VideosModule } from './videos/videos.module.js';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRootAsync({ inject: [ConfigService], useFactory: loggerParams }),
    EventEmitterModule.forRoot(),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: { url: config.get('REDIS_URL', { infer: true }) },
      }),
    }),
    PrismaModule,
    RedisModule,
    HealthModule,
    AvatarsModule,
    AuthModule,
    UsersModule,
    FollowsModule,
    UploadsModule,
    // Before VideosModule: GET /videos/feed must be registered ahead of GET /videos/:id.
    FeedModule,
    VideosModule,
    LikesModule,
    CommentsModule,
    SharesModule,
    NotificationsModule,
    AdminModule,
  ],
})
export class AppModule {}
