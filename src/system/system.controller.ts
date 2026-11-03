import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@auth/decorators/public.decorator';
import { SystemService } from './system.service';

@ApiTags('System')
@Controller()
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Public()
  @Get('version')
  @ApiOperation({ summary: 'Get build/version metadata' })
  getVersion() {
    return this.systemService.getVersion();
  }

  @Public()
  @Get('geo/cities')
  @ApiOperation({ summary: 'List supported delivery cities' })
  getCities() {
    return this.systemService.getSupportedCities();
  }
}
