import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { ParsePublicIdPipe } from '@common/pipes/parse-public-id.pipe';
import { RecentlyViewedService } from './recently-viewed.service';

@ApiTags('Recently Viewed')
@ApiBearerAuth()
@AccountTypes(AccountType.BUYER)
@Controller('users/recently-viewed')
export class RecentlyViewedController {
  constructor(private readonly service: RecentlyViewedService) {}

  @Post(':productId')
  @ApiOperation({ summary: 'Record a product viewed by the current buyer' })
  async record(
    @CurrentUser('userId') userId: string,
    @Param('productId', ParsePublicIdPipe) productId: string,
  ) {
    return this.service.record(userId, productId);
  }

  @Get()
  @ApiOperation({ summary: 'List recently viewed products for the current buyer' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, maximum: 50 })
  async list(
    @CurrentUser('userId') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.service.list(
      userId,
      Math.max(1, Number(page) || 1),
      Math.min(50, Math.max(1, Number(limit) || 20)),
    );
  }
}
