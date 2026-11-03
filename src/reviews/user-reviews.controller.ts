import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Body,
  Get,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { ParsePublicIdPipe } from '@common/pipes/parse-public-id.pipe';
import { ReviewsService } from './reviews.service';
import { UpdateReviewDto } from './dto/update-review.dto';

@ApiTags('Reviews')
@ApiBearerAuth()
@AccountTypes(AccountType.BUYER)
@Controller('reviews')
export class UserReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('pending')
  @ApiOperation({ summary: 'List delivered order products that the buyer has not reviewed' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, maximum: 50 })
  async getPendingReviews(
    @CurrentUser('userId') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.reviewsService.findPendingReviews(
      userId,
      Math.max(1, Number(page) || 1),
      Math.min(50, Math.max(1, Number(limit) || 20)),
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit your own review' })
  async updateReview(
    @Param('id', ParsePublicIdPipe) id: string,
    @Body() dto: UpdateReviewDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.reviewsService.updateOwnReview(id, userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete your own review' })
  async deleteReview(
    @Param('id', ParsePublicIdPipe) id: string,
    @CurrentUser('userId') userId: string,
  ) {
    await this.reviewsService.deleteOwnReview(id, userId);
  }
}
