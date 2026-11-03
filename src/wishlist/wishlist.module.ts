import { Module } from '@nestjs/common';
import { PrismaModule } from '@database/prisma.module';
import { WishlistRepository } from './wishlist.repository';
import { WishlistService } from './wishlist.service';
import { WishlistController } from './wishlist.controller';
import { ProductsModule } from '@products/products.module';

@Module({
  imports: [PrismaModule, ProductsModule],
  controllers: [WishlistController],
  providers: [WishlistRepository, WishlistService],
  exports: [WishlistService],
})
export class WishlistModule {}
