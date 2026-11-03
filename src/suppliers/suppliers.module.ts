import { Module } from '@nestjs/common';
import { SuppliersController } from './suppliers.controller';
import { ProductsModule } from '@products/products.module';
import { OrdersModule } from '@orders/orders.module';

@Module({
  imports: [ProductsModule, OrdersModule],
  controllers: [SuppliersController],
})
export class SuppliersModule {}
