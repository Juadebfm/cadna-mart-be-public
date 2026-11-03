import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsController } from './payments.controller';
import { StripeController, StripeWebhookController } from './stripe.controller';
import { PodController } from './pod.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController, StripeController, StripeWebhookController, PodController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
