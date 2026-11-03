import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { ParsePublicIdPipe } from '@common/pipes/parse-public-id.pipe';
import { ReviewsService } from './reviews.service';
import { ModerateReviewDto } from './dto/moderate-review.dto';
import { ResolveReviewReportDto } from './dto/resolve-review-report.dto';

@ApiTags('Admin — Reviews')
@ApiBearerAuth()
@AccountTypes(AccountType.ADMIN)
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('reports')
  @ApiOperation({ summary: 'List seller reports awaiting review' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number, maximum: 50 })
  listReports(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.reviewsService.listPendingReviewReports(
      Math.max(1, Number(page) || 1),
      Math.min(50, Math.max(1, Number(limit) || 20)),
    );
  }

  @Post('reports/:reportId/resolve')
  @ApiOperation({ summary: 'Keep a reported review visible or hide it' })
  resolveReport(
    @Param('reportId', ParsePublicIdPipe) reportId: string,
    @Body() dto: ResolveReviewReportDto,
    @CurrentUser('userId') adminUserId: string,
  ) {
    return this.reviewsService.resolveReviewReport(reportId, adminUserId, dto.action, dto.reason);
  }

  @Post(':id/moderate')
  @ApiOperation({ summary: 'Moderate a review by approving or hiding it' })
  async moderateReview(
    @Param('id', ParsePublicIdPipe) id: string,
    @Body() dto: ModerateReviewDto,
    @CurrentUser('userId') adminUserId: string,
  ) {
    return this.reviewsService.moderateReview(id, adminUserId, dto);
  }
}
