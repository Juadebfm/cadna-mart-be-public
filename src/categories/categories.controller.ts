import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '@auth/decorators/public.decorator';
import { CategoriesService } from './categories.service';
import { CategoryQueryDto } from './dto/category-query.dto';

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get categories (flat or tree)' })
  async findAll(@Query() query: CategoryQueryDto) {
    return this.categoriesService.findAll(query.tree, query.includeCounts);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Get a single category by slug' })
  async findBySlug(@Param('slug') slug: string) {
    const category = await this.categoriesService.findBySlug(slug);
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      iconUrl: category.iconUrl,
      parent: category.parentId,
      productCount: category.productCount,
    };
  }
}
