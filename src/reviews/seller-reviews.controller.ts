import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { ParsePublicIdPipe } from '@common/pipes/parse-public-id.pipe';
import { ReviewsService } from './reviews.service';
import { SellerReviewReplyDto } from './dto/seller-review-reply.dto';

@ApiTags('Seller — Reviews')
@ApiBearerAuth()
@AccountTypes(AccountType.SELLER)
@Controller('sellers/me/products/:productId/reviews')
export class SellerReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @ApiOperation({ summary: 'List reviews for one of your products' })
  @ApiQuery({
    name: 'filter',
    required: false,
    enum: ['all', '5', '4', '3', '2', '1', 'unreplied', 'flagged'],
  })
  async list(
    @CurrentUser('userId') userId: string,
    @Param('productId', ParsePublicIdPipe) productId: string,
    @Query('filter') filter = 'all',
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.reviewsService.listSellerReviews(
      userId,
      productId,
      filter,
      Math.max(1, Number(page) || 1),
      Math.min(50, Math.max(1, Number(limit) || 20)),
    );
  }

  @Post(':reviewId/reply')
  @ApiOperation({ summary: 'Reply to a review for your product' })
  createReply(
    @CurrentUser('userId') userId: string,
    @Param('productId', ParsePublicIdPipe) productId: string,
    @Param('reviewId', ParsePublicIdPipe) reviewId: string,
    @Body() dto: SellerReviewReplyDto,
  ) {
    return this.reviewsService.createSellerReply(userId, productId, reviewId, dto.reply);
  }

  @Patch(':reviewId/reply')
  @ApiOperation({ summary: 'Edit your reply to a review' })
  updateReply(
    @CurrentUser('userId') userId: string,
    @Param('productId', ParsePublicIdPipe) productId: string,
    @Param('reviewId', ParsePublicIdPipe) reviewId: string,
    @Body() dto: SellerReviewReplyDto,
  ) {
    return this.reviewsService.updateSellerReply(userId, productId, reviewId, dto.reply);
  }

  @Delete(':reviewId/reply')
  @ApiOperation({ summary: 'Delete your reply to a review' })
  deleteReply(
    @CurrentUser('userId') userId: string,
    @Param('productId', ParsePublicIdPipe) productId: string,
    @Param('reviewId', ParsePublicIdPipe) reviewId: string,
  ) {
    return this.reviewsService.deleteSellerReply(userId, productId, reviewId);
  }

  @Post(':reviewId/report')
  @ApiOperation({ summary: 'Send a review for Cadna to check; it remains visible while pending' })
  report(
    @CurrentUser('userId') userId: string,
    @Param('productId', ParsePublicIdPipe) productId: string,
    @Param('reviewId', ParsePublicIdPipe) reviewId: string,
  ) {
    return this.reviewsService.reportSellerReview(userId, productId, reviewId);
  }

  @Delete(':reviewId/report')
  @ApiOperation({ summary: 'Cancel your pending report of a review' })
  cancelReport(
    @CurrentUser('userId') userId: string,
    @Param('productId', ParsePublicIdPipe) productId: string,
    @Param('reviewId', ParsePublicIdPipe) reviewId: string,
  ) {
    return this.reviewsService.cancelSellerReviewReport(userId, productId, reviewId);
  }
}
