import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '@auth/decorators/public.decorator';
import { SiteConfigService } from './site-config.service';

@ApiTags('Site Config')
@Controller('site-config')
export class SiteConfigController {
  constructor(private readonly siteConfigService: SiteConfigService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get site configuration (footer, contact, social)' })
  async getConfig() {
    return this.siteConfigService.getConfig();
  }
}
