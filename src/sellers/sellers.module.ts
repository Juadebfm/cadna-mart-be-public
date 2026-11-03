import { Module } from '@nestjs/common';
import { SellersRepository } from './sellers.repository';
import { SellersService } from './sellers.service';
import { SellersController } from './sellers.controller';
import { SellerPostOrderController } from './seller-post-order.controller';
import { ProductsModule } from '@products/products.module';
import { UsersModule } from '@users/users.module';
import { OrdersModule } from '@orders/orders.module';
import { ReturnsModule } from '@returns/returns.module';
import { SellerApplicationsController } from './seller-applications.controller';
import { SellerBankingService } from './seller-banking.service';
import { SellerPiiService } from './seller-pii.service';
import { UploadModule } from '@upload/upload.module';
import { SellerKycProviderService } from './seller-kyc-provider.service';

@Module({
  imports: [ProductsModule, UsersModule, OrdersModule, ReturnsModule, UploadModule],
  controllers: [SellersController, SellerPostOrderController, SellerApplicationsController],
  providers: [
    SellersRepository,
    SellersService,
    SellerBankingService,
    SellerPiiService,
    SellerKycProviderService,
  ],
  exports: [SellersService, SellersRepository],
})
export class SellersModule {}
