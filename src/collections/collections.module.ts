import { Module } from '@nestjs/common';
import { CollectionsController } from './collections.controller';
import { ProductsModule } from '@products/products.module';

@Module({
  imports: [ProductsModule],
  controllers: [CollectionsController],
})
export class CollectionsModule {}
