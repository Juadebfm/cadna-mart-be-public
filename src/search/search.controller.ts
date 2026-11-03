import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '@auth/decorators/public.decorator';
import { SearchService } from './search.service';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Global product search with filters and pagination' })
  async search(
    @Query('q') q?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('category') category?: string,
    @Query('brand') brand?: string,
    @Query('minPrice') minPrice?: number,
    @Query('maxPrice') maxPrice?: number,
    @Query('sort') sort?: string,
  ) {
    return this.searchService.search({
      q,
      page: +page,
      limit: +limit,
      category,
      brand,
      minPrice: minPrice !== undefined ? +minPrice : undefined,
      maxPrice: maxPrice !== undefined ? +maxPrice : undefined,
      sort,
    });
  }

  @Public()
  @Get('suggest')
  @ApiOperation({ summary: 'Search suggestions/autocomplete' })
  async suggest(@Query('q') q: string, @Query('limit') limit: number = 8) {
    return this.searchService.suggest(q, Math.min(+limit || 8, 20));
  }

  @Public()
  @Get('suggestions')
  @ApiOperation({ summary: 'Search suggestions/autocomplete (spec alias of /suggest)' })
  async suggestions(@Query('q') q: string, @Query('limit') limit: number = 8) {
    return this.searchService.suggest(q, Math.min(+limit || 8, 20));
  }
}
