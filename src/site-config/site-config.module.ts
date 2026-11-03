import { Module } from '@nestjs/common';
import { SiteConfigController } from './site-config.controller';
import { SiteConfigService } from './site-config.service';
import { PublicConfigController } from './public-config.controller';
import { LegalPagesController } from './legal-pages.controller';

@Module({
  imports: [],
  controllers: [SiteConfigController, PublicConfigController, LegalPagesController],
  providers: [SiteConfigService],
  exports: [SiteConfigService],
})
export class SiteConfigModule {}
