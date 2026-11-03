import { Module } from '@nestjs/common';
import { ClerkWebhookController } from './clerk-webhook.controller';
import { UsersModule } from '@users/users.module';
import { DealsModule } from '../deals/deals.module';
import { PaymentsModule } from '../payments/payments.module';
import { PaystackWebhookController } from './paystack-webhook.controller';
import { NotificationsModule } from '@notifications/notifications.module';
import { ReturnsModule } from '@returns/returns.module';
import { DataRequestsModule } from '@data-requests/data-requests.module';

@Module({
  imports: [
    UsersModule,
    DealsModule,
    PaymentsModule,
    NotificationsModule,
    ReturnsModule,
    DataRequestsModule,
  ],
  controllers: [ClerkWebhookController, PaystackWebhookController],
})
export class WebhooksModule {}
