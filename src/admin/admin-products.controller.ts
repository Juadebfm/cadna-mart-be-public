import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { ProductsService } from '@products/products.service';
import { ProductsRepository } from '@products/products.repository';
import { CreateProductDto } from '@products/dto/create-product.dto';
import { UpdateProductDto } from '@products/dto/update-product.dto';
import { ParsePublicIdPipe } from '@common/pipes/parse-public-id.pipe';
import { RejectProductDto } from './dto/reject-product.dto';
import { FeatureProductDto } from './dto/feature-product.dto';

@ApiTags('Admin — Products')
@ApiBearerAuth()
@AccountTypes(AccountType.ADMIN)
@Controller('admin/products')
export class AdminProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly productsRepository: ProductsRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all products (including inactive)' })
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('includeInactive') includeInactive: string | boolean | number = true,
  ) {
    const parsedIncludeInactive =
      includeInactive === true || includeInactive === 'true' || includeInactive === 1;
    const { items, totalItems } = await this.productsRepository.findAllAdmin(
      +page,
      Math.min(+limit, 100),
      parsedIncludeInactive,
    );
    const totalPages = Math.ceil(totalItems / +limit);
    return {
      items: items.map((p) => this.productsService.toManageCard(p)),
      pagination: { page: +page, limit: +limit, totalItems, totalPages },
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create a product from the admin namespace' })
  async create(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: { userId: string; accountType: string },
  ) {
    return this.productsService.createProduct(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update any product' })
  async update(
    @Param('id', ParsePublicIdPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: { userId: string; accountType: string },
  ) {
    return this.productsService.updateProduct(id, dto, user);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Toggle product active/inactive status' })
  async toggleStatus(
    @Param('id', ParsePublicIdPipe) id: string,
    @Body('isActive') isActive: boolean,
  ) {
    return this.productsRepository.update(id, { isActive } as any);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a product listing' })
  async approve(@Param('id', ParsePublicIdPipe) id: string) {
    return this.productsService.approveProduct(id);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a product listing' })
  async reject(@Param('id', ParsePublicIdPipe) id: string, @Body() dto: RejectProductDto) {
    return this.productsService.rejectProduct(id, dto.reason);
  }

  @Post(':id/feature')
  @ApiOperation({ summary: 'Feature or unfeature a product in the storefront rail' })
  async feature(@Param('id', ParsePublicIdPipe) id: string, @Body() dto: FeatureProductDto) {
    return this.productsService.featureProduct(id, dto.featured ?? true, dto.badge);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Force delete any product' })
  async remove(
    @Param('id', ParsePublicIdPipe) id: string,
    @CurrentUser() user: { userId: string; accountType: string },
  ) {
    await this.productsService.removeProduct(id, user);
  }
}
