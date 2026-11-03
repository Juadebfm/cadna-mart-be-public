import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '@auth/decorators/public.decorator';
import { ProductsService } from '@products/products.service';

@ApiTags('Collections')
@Controller('collections')
export class CollectionsController {
  constructor(private readonly productsService: ProductsService) {}

  @Public()
  @Get('featured')
  @ApiOperation({ summary: 'Featured collection (products tagged sections=featured)' })
  async featured(@Query('limit') limit = 20) {
    return this.list('featured', limit);
  }

  @Public()
  @Get('flash-sales')
  @ApiOperation({ summary: 'Flash sales collection (products tagged sections=flash_sale)' })
  async flashSales(@Query('limit') limit = 20) {
    return this.list('flash_sale', limit);
  }

  @Public()
  @Get('best-deals')
  @ApiOperation({ summary: 'Best deals collection (products tagged sections=best_deals)' })
  async bestDeals(@Query('limit') limit = 20) {
    return this.list('best_deals', limit);
  }

  private async list(section: string, limit: number | string) {
    const cap = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const products = await this.productsService.findBySection(section, cap);
    return {
      section,
      items: products.map((p) => this.productsService.toCard(p)),
    };
  }
}
