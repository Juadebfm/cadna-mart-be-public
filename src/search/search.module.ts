import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { ProductsModule } from '@products/products.module';

@Module({
  imports: [ProductsModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
