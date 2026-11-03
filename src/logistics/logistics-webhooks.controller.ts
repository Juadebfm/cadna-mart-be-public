import { Body, Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '@auth/decorators/public.decorator';
import { LogisticsService } from './logistics.service';

@ApiTags('Webhooks')
@Controller('webhooks/logistics')
export class LogisticsWebhooksController {
  constructor(private readonly logisticsService: LogisticsService) {}

  @Public()
  @Post('/uber')
  @HttpCode(HttpStatus.OK)
  async uberWebhook(@Body() payload: unknown): Promise<object> {
    return this.logisticsService.handleUberWebhook(payload);
  }

  @Public()
  @Post('/bolt')
  @HttpCode(HttpStatus.OK)
  async boltWebhook(@Body() payload: unknown): Promise<object> {
    return this.logisticsService.handleBoltWebhook(payload);
  }
}
