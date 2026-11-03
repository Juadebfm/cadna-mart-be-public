import { Controller, Get, Post, Param, Query, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '@auth/decorators/public.decorator';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { ReviewsService } from './reviews.service';
import { ReviewSortOption } from './reviews.repository';
import { CreateReviewDto } from './dto/create-review.dto';

@ApiTags('Reviews')
@Controller('products')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Public()
  @Get(':productId/reviews')
  @ApiOperation({ summary: 'Get product reviews with summary' })
  async findByProduct(
    @Param('productId') productId: string,
    @Query('sort') sort: ReviewSortOption = 'most_recent',
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.reviewsService.findByProduct(productId, sort, +page, +limit);
  }

  @ApiBearerAuth()
  @AccountTypes(AccountType.BUYER)
  @Post(':productId/reviews')
  @ApiOperation({ summary: 'Write a review for a product (one per user per product)' })
  async createReview(
    @Param('productId') productId: string,
    @Body() dto: CreateReviewDto,
    @CurrentUser() user: { userId: string; firstName: string; lastName: string },
  ) {
    const userName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Anonymous';
    return this.reviewsService.createReview(productId, user.userId, userName, dto);
  }

  @Post(':productId/reviews/:reviewId/helpful')
  @ApiBearerAuth()
  @AccountTypes(AccountType.BUYER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a review as helpful (once per buyer)' })
  async markHelpful(
    @Param('productId') productId: string,
    @Param('reviewId') reviewId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.reviewsService.markHelpful(reviewId, userId, productId);
  }
}
