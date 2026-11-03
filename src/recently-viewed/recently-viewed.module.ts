import { Module } from '@nestjs/common';
import { ProductsModule } from '@products/products.module';
import { RecentlyViewedController } from './recently-viewed.controller';
import { RecentlyViewedRepository } from './recently-viewed.repository';
import { RecentlyViewedService } from './recently-viewed.service';

@Module({
  imports: [ProductsModule],
  controllers: [RecentlyViewedController],
  providers: [RecentlyViewedRepository, RecentlyViewedService],
})
export class RecentlyViewedModule {}
