import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@auth/decorators/public.decorator';
import { SiteConfigService } from './site-config.service';

@ApiTags('Site Config')
@Controller('config')
export class PublicConfigController {
  constructor(private readonly siteConfigService: SiteConfigService) {}

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Get public application configuration (spec alias)' })
  async getPublicConfig() {
    return this.siteConfigService.getPublicConfig();
  }
}
