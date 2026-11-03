import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './orders.repository';
import { UsersModule } from '@users/users.module';
import { CartModule } from '@cart/cart.module';
import { NotificationsModule } from '@notifications/notifications.module';
import { OrderExpiryProcessor } from './order-expiry.processor';
import { LogisticsModule } from '@logistics/logistics.module';

@Module({
  imports: [UsersModule, CartModule, NotificationsModule, LogisticsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository, OrderExpiryProcessor],
  exports: [OrdersService, OrdersRepository],
})
export class OrdersModule {}
