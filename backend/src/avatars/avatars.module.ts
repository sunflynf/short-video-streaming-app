import { Global, Module } from '@nestjs/common';
import { AvatarsController } from './avatars.controller.js';
import { AvatarsService } from './avatars.service.js';

/** Global so UsersService can validate avatar URLs without a module cycle. */
@Global()
@Module({
  controllers: [AvatarsController],
  providers: [AvatarsService],
  exports: [AvatarsService],
})
export class AvatarsModule {}
