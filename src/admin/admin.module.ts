import { Module } from '@nestjs/common';
import { ProductsModule } from '@products/products.module';
import { SellersModule } from '@sellers/sellers.module';
import { CategoriesModule } from '@categories/categories.module';
import { UsersModule } from '@users/users.module';
import { OrdersModule } from '@orders/orders.module';
import { ReturnsModule } from '@returns/returns.module';
import { SiteConfigModule } from '@site-config/site-config.module';
import { AdminProductsController } from './admin-products.controller';
import { AdminSellersController } from './admin-sellers.controller';
import { AdminCategoriesController } from './admin-categories.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminPricingController } from './admin-pricing.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminDeliveryController } from './admin-delivery.controller';
import { AdminReportingController } from './admin-reporting.controller';
import { AdminComplianceController } from './admin-compliance.controller';
import { AdminPricingService } from './pricing/admin-pricing.service';
import { DeliveryConfigService } from './delivery-config.service';
import { DataRequestsModule } from '@data-requests/data-requests.module';

@Module({
  imports: [
    ProductsModule,
    SellersModule,
    CategoriesModule,
    UsersModule,
    OrdersModule,
    ReturnsModule,
    SiteConfigModule,
    DataRequestsModule,
  ],
  controllers: [
    AdminProductsController,
    AdminSellersController,
    AdminCategoriesController,
    AdminUsersController,
    AdminPricingController,
    AdminOrdersController,
    AdminDeliveryController,
    AdminReportingController,
    AdminComplianceController,
  ],
  providers: [AdminPricingService, DeliveryConfigService],
})
export class AdminModule {}
