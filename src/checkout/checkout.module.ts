import { Module } from '@nestjs/common';
import { PrismaModule } from '@database/prisma.module';
import { CartModule } from '@cart/cart.module';
import { OrdersModule } from '../orders/orders.module';
import { LogisticsModule } from '@logistics/logistics.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

@Module({
  imports: [PrismaModule, CartModule, OrdersModule, LogisticsModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
