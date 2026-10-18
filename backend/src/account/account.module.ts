import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { AccountController } from './account.controller.js';
import { AccountService } from './account.service.js';

@Module({
  imports: [MediaModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
