import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@auth/decorators/public.decorator';
import { SiteConfigService } from './site-config.service';

@ApiTags('Legal')
@Controller('legal')
export class LegalPagesController {
  constructor(private readonly siteConfigService: SiteConfigService) {}

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Fetch a public legal page by slug' })
  async getLegalPage(@Param('slug') slug: string) {
    return this.siteConfigService.getLegalPage(slug);
  }
}
