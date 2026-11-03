import { Controller, Get, Post, Delete, Param, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { WishlistService } from './wishlist.service';

@ApiTags('Wishlist')
@ApiBearerAuth()
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  @ApiOperation({ summary: 'Get wishlist items' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, maximum: 50 })
  async getWishlist(
    @CurrentUser('userId') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.wishlistService.getWishlist(
      userId,
      Math.max(1, Number(page) || 1),
      Math.min(50, Math.max(1, Number(limit) || 20)),
    );
  }

  @Post(':productId')
  @ApiOperation({ summary: 'Add to wishlist' })
  async addToWishlist(
    @CurrentUser('userId') userId: string,
    @Param('productId') productId: string,
  ) {
    return this.wishlistService.addToWishlist(userId, productId);
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove from wishlist' })
  async removeFromWishlist(
    @CurrentUser('userId') userId: string,
    @Param('productId') productId: string,
  ) {
    return this.wishlistService.removeFromWishlist(userId, productId);
  }
}
