import { Module } from '@nestjs/common';
import { LogisticsController } from './logistics.controller';
import { LogisticsWebhooksController } from './logistics-webhooks.controller';
import { LogisticsService } from './logistics.service';
import { LogisticsRepository } from './logistics.repository';
import { EmailModule } from '@email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [LogisticsController, LogisticsWebhooksController],
  providers: [LogisticsService, LogisticsRepository],
  exports: [LogisticsService, LogisticsRepository],
})
export class LogisticsModule {}
