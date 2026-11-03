import {
  Body,
  Controller,
  Delete,
  Get,
  MaxFileSizeValidator,
  Param,
  Patch,
  ParseFilePipe,
  Post,
  Query,
  Put,
  UploadedFile,
  UseInterceptors,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { SaveSellerApplicationDto } from './dto/save-seller-application.dto';
import { SellersService } from './sellers.service';
import { BankingDetailsDto } from './dto/banking-details.dto';
import { SellerDocumentType } from './schemas/seller-profile.schema';
import { Throttle } from '@nestjs/throttler';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import { ParsePublicIdPipe } from '@common/pipes/parse-public-id.pipe';
import { CreateMyProductDto } from './dto/create-my-product.dto';
import { UpdateProductDto } from '@products/dto/update-product.dto';
import { ProductQueryDto } from '@products/dto/product-query.dto';
import { SubmitSellerKycDto } from './dto/submit-seller-kyc.dto';

@ApiTags('Seller Applications')
@ApiBearerAuth()
@AccountTypes(AccountType.BUYER, AccountType.SELLER)
@Controller('sellers/applications/me')
export class SellerApplicationsController {
  constructor(private readonly sellersService: SellersService) {}

  @Get()
  @ApiOperation({ summary: 'Get the current account’s seller application and its status' })
  getMine(@CurrentUser('userId') userId: string) {
    return this.sellersService.getMyApplication(userId);
  }

  @Put()
  @ApiOperation({ summary: 'Save or update a seller application draft' })
  save(@CurrentUser('userId') userId: string, @Body() dto: SaveSellerApplicationDto) {
    return this.sellersService.saveMyApplication(userId, dto);
  }

  @Get('banks')
  @ApiOperation({
    summary: 'List supported banks for the configured account verification provider',
  })
  listBanks() {
    return this.sellersService.listSellerBanks();
  }

  @Put('bank')
  @ApiOperation({ summary: 'Verify and save the applicant payout account' })
  setBank(@CurrentUser('userId') userId: string, @Body() dto: BankingDetailsDto) {
    return this.sellersService.setApplicationBank(userId, dto);
  }

  @Post('kyc')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Submit seller identity details for private StackAPI verification' })
  submitKyc(@CurrentUser('userId') userId: string, @Body() dto: SubmitSellerKycDto) {
    return this.sellersService.verifyMyApplicationKyc(userId, dto);
  }

  @Post('submit')
  @ApiOperation({ summary: 'Submit a complete seller application for review' })
  submit(@CurrentUser('userId') userId: string) {
    return this.sellersService.submitMyApplication(userId);
  }

  @Get('products')
  @ApiOperation({
    summary: 'List products belonging to your seller application, including private drafts',
  })
  listProducts(@CurrentUser('userId') userId: string, @Query() query: ProductQueryDto) {
    return this.sellersService.getMyApplicationProducts(userId, query);
  }

  @Post('products')
  @ApiOperation({
    summary: 'Create a private product draft while your application is being reviewed',
  })
  createProduct(
    @CurrentUser() user: { userId: string; accountType: string },
    @Body() dto: CreateMyProductDto,
  ) {
    return this.sellersService.createApplicationProductDraft(user, dto);
  }

  @Patch('products/:id')
  @ApiOperation({
    summary: 'Update a private product draft while your application is being reviewed',
  })
  updateProduct(
    @CurrentUser() user: { userId: string; accountType: string },
    @Param('id', ParsePublicIdPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.sellersService.updateApplicationProductDraft(user, id, dto);
  }

  @Post('documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'documentType'],
      properties: {
        file: { type: 'string', format: 'binary' },
        documentType: { type: 'string', enum: Object.values(SellerDocumentType) },
      },
    },
  })
  @ApiOperation({
    summary: 'Upload an identity or registration file as a private authenticated asset',
  })
  uploadDocument(
    @CurrentUser('userId') userId: string,
    @Body('documentType') documentType: SellerDocumentType,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /^(image\/(jpeg|png|webp)|application\/pdf)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.sellersService.uploadApplicationDocument(userId, documentType, file);
  }

  @Delete('documents/:documentId')
  @ApiOperation({ summary: 'Delete one of your seller application documents before resubmitting' })
  deleteDocument(
    @CurrentUser('userId') userId: string,
    @Param('documentId', ParsePublicIdPipe) documentId: string,
  ) {
    return this.sellersService.deleteApplicationDocument(userId, documentId);
  }
}
