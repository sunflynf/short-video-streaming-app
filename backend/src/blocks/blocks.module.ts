import { Global, Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { BlocksController } from './blocks.controller.js';
import { BlocksService } from './blocks.service.js';

/** Global: feeds, comments, follows and notifications all need to respect blocks. */
@Global()
@Module({
  imports: [UsersModule],
  controllers: [BlocksController],
  providers: [BlocksService],
  exports: [BlocksService],
})
export class BlocksModule {}
