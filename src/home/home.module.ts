import { Module } from '@nestjs/common';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';
import { ProductsModule } from '@products/products.module';
import { CategoriesModule } from '@categories/categories.module';
import { BannersModule } from '@banners/banners.module';

@Module({
  imports: [ProductsModule, CategoriesModule, BannersModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
