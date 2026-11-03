import { Module } from '@nestjs/common';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { CategoryProductsController } from './category-products.controller';
import { CategoriesModule } from '@categories/categories.module';
import { PoliciesModule } from '@policies/policies.module';
import { ProductBulkImportService } from './product-bulk-import.service';

@Module({
  imports: [CategoriesModule, PoliciesModule],
  controllers: [ProductsController, CategoryProductsController],
  providers: [ProductsRepository, ProductsService, ProductBulkImportService],
  exports: [ProductsService, ProductsRepository, ProductBulkImportService],
})
export class ProductsModule {}
