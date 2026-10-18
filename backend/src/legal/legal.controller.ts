import { Controller, Get, Header } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator.js';
import type { Env } from '../config/env.js';
import { privacyPage, termsPage } from './legal-pages.js';

/** Served at /legal/* (outside /v1) so app stores and the signup screen can link to them. */
@Public()
@SkipThrottle()
@Controller('legal')
export class LegalController {
  constructor(private readonly config: ConfigService<Env, true>) {}

  @Get('terms')
  @Header('content-type', 'text/html; charset=utf-8')
  terms(): string {
    return termsPage(this.config.get('LEGAL_CONTACT_EMAIL', { infer: true }));
  }

  @Get('privacy')
  @Header('content-type', 'text/html; charset=utf-8')
  privacy(): string {
    return privacyPage(this.config.get('LEGAL_CONTACT_EMAIL', { infer: true }));
  }
}
