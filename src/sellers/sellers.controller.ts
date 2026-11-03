import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Res,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Public } from '@auth/decorators/public.decorator';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { SellersService } from './sellers.service';
import { CreateSellerDto } from './dto/create-seller.dto';
import { UpdateSellerDto } from './dto/update-seller.dto';
import { BankingDetailsDto } from './dto/banking-details.dto';
import { ProductsService } from '@products/products.service';
import { ProductQueryDto } from '@products/dto/product-query.dto';
import { UpdateProductDto } from '@products/dto/update-product.dto';
import { ParsePublicIdPipe } from '@common/pipes/parse-public-id.pipe';
import { CreateMyProductDto } from './dto/create-my-product.dto';
import { AttachProductImagesDto } from './dto/attach-product-images.dto';
import { UpdateStorefrontAvailabilityDto } from './dto/update-storefront-availability.dto';
import { ConfirmPickupAddressDto } from './dto/confirm-pickup-address.dto';
import {
  UpdateProductDeactivationDto,
  UpdateProductPublicationDto,
  UpdateProductRecommendationDto,
  UpdateProductSalesDto,
} from '@products/dto/product-lifecycle.dto';
import { ProductSalesQueryDto } from '@products/dto/product-sales-query.dto';
import { ProductBulkImportService } from '@products/product-bulk-import.service';
import { CommitProductImportDto } from '@products/dto/commit-product-import.dto';

@ApiTags('Sellers')
@Controller('sellers')
export class SellersController {
  constructor(
    private readonly sellersService: SellersService,
    private readonly productsService: ProductsService,
    private readonly productBulkImportService: ProductBulkImportService,
  ) {}

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Get('me')
  @ApiOperation({ summary: 'Get your seller profile (spec alias of GET /sellers/my)' })
  async getMeSeller(@CurrentUser('userId') userId: string) {
    return this.sellersService.getMySeller(userId);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Get('me/status')
  @ApiOperation({
    summary:
      'Get your seller onboarding status (recommended FE endpoint: email verification, banking completion, approval, and storefront readiness)',
  })
  async getMeStatus(@CurrentUser('userId') userId: string) {
    return this.sellersService.getMyOnboardingStatus(userId);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Patch('me')
  @ApiOperation({ summary: 'Update your seller profile (spec alias of PATCH /sellers/my)' })
  async updateMeSeller(
    @Body() dto: UpdateSellerDto,
    @CurrentUser() user: { userId: string; accountType: string },
  ) {
    return this.sellersService.updateMySeller(dto, user);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Patch('me/availability')
  @ApiOperation({ summary: 'Make your approved storefront visible or take it offline' })
  async setMyStorefrontAvailability(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateStorefrontAvailabilityDto,
  ) {
    return this.sellersService.setMyStorefrontActive(userId, dto.isActive);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Get('me/products')
  @ApiOperation({ summary: 'List your own product listings, including inactive ones' })
  async getMyProducts(@CurrentUser('userId') userId: string, @Query() query: ProductQueryDto) {
    return this.productsService.findMyProducts(userId, query);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Get('me/products/bulk-upload/template')
  @ApiOperation({ summary: 'Download the CSV template for importing Draft products' })
  downloadProductImportTemplate(@Res() response: Response) {
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="cadna-products-template.csv"');
    response.send(this.productBulkImportService.template());
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Post('me/products/bulk-upload/preview')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Validate a product CSV and return row errors before saving anything' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async previewProductImport(
    @UploadedFile(
      new ParseFilePipe({ validators: [new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 })] }),
    )
    file: Express.Multer.File,
    @CurrentUser('userId') userId: string,
  ) {
    if (!file.originalname.toLowerCase().endsWith('.csv')) {
      throw new BadRequestException('Upload a .csv file');
    }
    return this.productBulkImportService.preview(file.buffer, userId);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Post('me/products/bulk-upload/commit')
  @ApiOperation({ summary: 'Create all products from a valid, unexpired CSV preview' })
  async commitProductImport(
    @Body() dto: CommitProductImportDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.productBulkImportService.commit(dto.previewId, userId);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Get('me/products/:id/sales')
  @ApiOperation({ summary: 'Get units sold over time for one of your products' })
  async getMyProductSales(
    @Param('id', ParsePublicIdPipe) id: string,
    @CurrentUser() user: { userId: string; accountType: string },
    @Query() query: ProductSalesQueryDto,
  ) {
    return this.productsService.getMyProductSales(id, user, query);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Get('me/products/recommendations')
  @ApiOperation({ summary: 'List your recommended Live products' })
  async getMyRecommendedProducts(@CurrentUser('userId') userId: string) {
    return this.productsService.findMyRecommendations(userId);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Post('me/products')
  @ApiOperation({ summary: 'Create a product under your seller profile' })
  async createMyProduct(
    @Body() dto: CreateMyProductDto,
    @CurrentUser() user: { userId: string; accountType: string },
  ) {
    return this.productsService.createMyProduct(dto, user);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Patch('me/products/:id')
  @ApiOperation({ summary: 'Update one of your own product listings' })
  async updateMyProduct(
    @Param('id', ParsePublicIdPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: { userId: string; accountType: string },
  ) {
    return this.productsService.updateProduct(id, dto, user);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Patch('me/products/:id/publication')
  @ApiOperation({ summary: 'Save a product as Draft or set it Live' })
  setProductPublication(
    @Param('id', ParsePublicIdPipe) id: string,
    @Body() dto: UpdateProductPublicationDto,
    @CurrentUser() user: { userId: string; accountType: string },
  ) {
    return this.productsService.setPublicationStatus(id, dto.status, user);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Patch('me/products/:id/sales')
  @ApiOperation({ summary: 'Close or reopen sales while keeping the product visible' })
  setProductSales(
    @Param('id', ParsePublicIdPipe) id: string,
    @Body() dto: UpdateProductSalesDto,
    @CurrentUser() user: { userId: string; accountType: string },
  ) {
    return this.productsService.setSalesClosed(id, dto.closed, user);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Patch('me/products/:id/deactivation')
  @ApiOperation({ summary: 'Hide a product from buyers or restore its visibility' })
  setProductDeactivation(
    @Param('id', ParsePublicIdPipe) id: string,
    @Body() dto: UpdateProductDeactivationDto,
    @CurrentUser() user: { userId: string; accountType: string },
  ) {
    return this.productsService.setDeactivated(id, dto.deactivated, user);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Patch('me/products/:id/recommendation')
  @ApiOperation({ summary: 'Add or remove a product from your recommendations' })
  setProductRecommendation(
    @Param('id', ParsePublicIdPipe) id: string,
    @Body() dto: UpdateProductRecommendationDto,
    @CurrentUser() user: { userId: string; accountType: string },
  ) {
    return this.productsService.setRecommended(id, dto.recommended, user);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Post('me/products/:id/duplicate')
  @ApiOperation({ summary: 'Copy a product into a Draft with new SKUs and no stock' })
  duplicateProduct(
    @Param('id', ParsePublicIdPipe) id: string,
    @CurrentUser() user: { userId: string; accountType: string },
  ) {
    return this.productsService.duplicateProduct(id, user);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Get('me/pickup-address')
  @ApiOperation({ summary: 'Get your confirmed courier pickup address' })
  getPickupAddress(@CurrentUser('userId') userId: string) {
    return this.sellersService.getMyPickupAddress(userId);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Put('me/pickup-address')
  @ApiOperation({ summary: 'Save and confirm the address where couriers may collect orders' })
  confirmPickupAddress(
    @CurrentUser('userId') userId: string,
    @Body() dto: ConfirmPickupAddressDto,
  ) {
    return this.sellersService.confirmMyPickupAddress(userId, dto);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Delete('me/products/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Withdraw one of your own product listings' })
  async removeMyProduct(
    @Param('id', ParsePublicIdPipe) id: string,
    @CurrentUser() user: { userId: string; accountType: string },
  ) {
    await this.productsService.removeProduct(id, user);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Post('me/products/:id/images')
  @ApiOperation({ summary: 'Attach uploaded image URLs to one of your products' })
  async attachProductImages(
    @Param('id', ParsePublicIdPipe) id: string,
    @Body() dto: AttachProductImagesDto,
    @CurrentUser() user: { userId: string; accountType: string },
  ) {
    return this.productsService.attachProductImages(id, dto.images, user);
  }

  @Public()
  @Get(':sellerId/summary')
  @ApiOperation({ summary: 'Get seller summary card' })
  async getSummary(@Param('sellerId') sellerId: string) {
    return this.sellersService.getSummary(sellerId);
  }

  @Public()
  @Get(':sellerSlug/products')
  @ApiOperation({ summary: 'List all products for a seller' })
  async getSellerProducts(
    @Param('sellerSlug') sellerSlug: string,
    @Query() query: ProductQueryDto,
  ) {
    return this.productsService.findBySeller(sellerSlug, query);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.BUYER)
  @Get('following')
  @ApiOperation({ summary: 'List sellers followed by the current buyer with product previews' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, maximum: 50 })
  async getFollowedSellers(
    @CurrentUser('userId') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.sellersService.getFollowedSellers(
      userId,
      Math.max(1, Number(page) || 1),
      Math.min(50, Math.max(1, Number(limit) || 20)),
    );
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.BUYER, AccountType.SELLER)
  @Post(':sellerId/follow')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Follow a seller' })
  async follow(@Param('sellerId') sellerId: string, @CurrentUser('userId') userId: string) {
    await this.sellersService.followSeller(userId, sellerId);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.BUYER, AccountType.SELLER)
  @Delete(':sellerId/follow')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unfollow a seller' })
  async unfollow(@Param('sellerId') sellerId: string, @CurrentUser('userId') userId: string) {
    await this.sellersService.unfollowSeller(userId, sellerId);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Post()
  @ApiOperation({ summary: 'Create your seller profile (one per seller)' })
  async createSeller(@Body() dto: CreateSellerDto, @CurrentUser('userId') userId: string) {
    return this.sellersService.createSeller(dto, userId);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Get('my')
  @ApiOperation({ summary: 'Get your seller profile' })
  async getMySeller(@CurrentUser('userId') userId: string) {
    return this.sellersService.getMySeller(userId);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Get('my/status')
  @ApiOperation({
    summary:
      'Get your seller onboarding status (backward-compatible alias of GET /sellers/me/status)',
  })
  async getMyStatus(@CurrentUser('userId') userId: string) {
    return this.sellersService.getMyOnboardingStatus(userId);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Patch('my')
  @ApiOperation({ summary: 'Update your seller profile' })
  async updateMySeller(
    @Body() dto: UpdateSellerDto,
    @CurrentUser() user: { userId: string; accountType: string },
  ) {
    return this.sellersService.updateMySeller(dto, user);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Get('my/banking')
  @ApiOperation({
    summary:
      'Get your seller bank/payout details. Returns nulls if not yet submitted. Backward-compatible alias of GET /sellers/me/banking.',
  })
  async getMyBanking(@CurrentUser('userId') userId: string) {
    return this.sellersService.getMyBankingDetails(userId);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Get('me/banking')
  @ApiOperation({
    summary:
      'Get your seller bank/payout details. Returns nulls if not yet submitted. Recommended FE endpoint.',
  })
  async getMeBanking(@CurrentUser('userId') userId: string) {
    return this.sellersService.getMyBankingDetails(userId);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Post('my/banking')
  @ApiOperation({
    summary:
      'Submit/update your seller bank/payout details. Required once after seller registration; collected by the FE on the same wizard screen but POSTed here after login (kept off the public registration endpoints). Backward-compatible alias of POST /sellers/me/banking.',
  })
  async setMyBanking(@CurrentUser('userId') userId: string, @Body() dto: BankingDetailsDto) {
    return this.sellersService.setMyBankingDetails(userId, dto);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.SELLER)
  @Post('me/banking')
  @ApiOperation({
    summary:
      'Submit/update your seller bank/payout details. Required once after seller registration; collected by the FE on the same wizard screen but POSTed here after login. Recommended FE endpoint.',
  })
  async setMeBanking(@CurrentUser('userId') userId: string, @Body() dto: BankingDetailsDto) {
    return this.sellersService.setMyBankingDetails(userId, dto);
  }
}
