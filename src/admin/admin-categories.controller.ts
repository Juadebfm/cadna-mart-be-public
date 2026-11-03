import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { CategoriesService } from '@categories/categories.service';
import { CategoriesRepository, CategoryWriteData } from '@categories/categories.repository';
import { ParsePublicIdPipe } from '@common/pipes/parse-public-id.pipe';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('Admin — Categories')
@ApiBearerAuth()
@AccountTypes(AccountType.ADMIN)
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly categoriesRepository: CategoriesRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all categories (flat)' })
  async findAll() {
    return this.categoriesService.findAll(false, true);
  }

  @Post()
  @ApiOperation({ summary: 'Create a category or sub-category' })
  async create(@Body() dto: CreateCategoryDto) {
    return this.categoriesRepository.create({
      name: dto.name,
      slug: dto.slug,
      iconUrl: dto.iconUrl ?? null,
      parent: (dto.parentId as any) ?? null,
      order: dto.order ?? 0,
      isActive: dto.isActive ?? true,
      productCount: 0,
      deletedAt: null,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a category' })
  async update(@Param('id', ParsePublicIdPipe) id: string, @Body() dto: UpdateCategoryDto) {
    const updates: CategoryWriteData = {};
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.slug !== undefined) updates.slug = dto.slug;
    if (dto.iconUrl !== undefined) updates.iconUrl = dto.iconUrl;
    if (dto.parentId !== undefined) updates.parent = dto.parentId;
    if (dto.order !== undefined) updates.order = dto.order;
    if (dto.isActive !== undefined) updates.isActive = dto.isActive;
    return this.categoriesRepository.update(id, updates);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete a category' })
  async remove(@Param('id', ParsePublicIdPipe) id: string) {
    await this.categoriesRepository.update(id, { deletedAt: new Date(), isActive: false });
  }
}
