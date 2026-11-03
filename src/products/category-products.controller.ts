import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '@auth/decorators/public.decorator';
import { ProductsService } from './products.service';
import { ProductQueryDto } from './dto/product-query.dto';

@ApiTags('Categories')
@Controller('categories')
export class CategoryProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Public()
  @Get(':slug/products')
  @ApiOperation({ summary: 'List products in a category by slug (paginated)' })
  async listByCategory(@Param('slug') slug: string, @Query() query: ProductQueryDto) {
    return this.productsService.findAll({ ...query, category: slug } as ProductQueryDto);
  }
}
