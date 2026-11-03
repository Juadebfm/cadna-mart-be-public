import { Module } from '@nestjs/common';
import { ReviewsRepository } from './reviews.repository';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { UserReviewsController } from './user-reviews.controller';
import { AdminReviewsController } from './admin-reviews.controller';
import { SellerReviewsController } from './seller-reviews.controller';
import { PrismaModule } from '@database/prisma.module';
import { UploadModule } from '@upload/upload.module';

@Module({
  imports: [PrismaModule, UploadModule],
  controllers: [
    ReviewsController,
    UserReviewsController,
    AdminReviewsController,
    SellerReviewsController,
  ],
  providers: [ReviewsRepository, ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
