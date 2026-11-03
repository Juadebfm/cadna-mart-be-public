import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { ReviewsRepository, ReviewSortOption } from './reviews.repository';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ModerateReviewDto } from './dto/moderate-review.dto';
import { Review } from './schemas/review.schema';
import { OrderStatus } from '@orders/schemas/order.schema';
import { UploadService } from '@upload/upload.service';
import { createPublicId } from '@database/id.util';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly reviewsRepository: ReviewsRepository,
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
  ) {}

  async createReview(productId: string, userId: string, userName: string, dto: CreateReviewDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null, isActive: true },
      select: { id: true },
    });

    if (!product) throw new NotFoundException('Product not found');

    const existing = await this.reviewsRepository.findByUserAndProduct(userId, productId);
    if (existing) throw new ConflictException('You have already reviewed this product');

    const deliveredOrders: Array<{ items: unknown }> = await this.prisma.order.findMany({
      where: { userId, status: OrderStatus.DELIVERED, deletedAt: null },
      select: { items: true },
    });
    const isVerifiedPurchase = deliveredOrders.some((order) =>
      (Array.isArray(order.items) ? order.items : []).some((item) => item.productId === productId),
    );
    if (!isVerifiedPurchase) {
      throw new ForbiddenException('A delivered purchase of this product is required to review it');
    }
    const image = dto.imagePublicId
      ? this.uploadService.resolveOwnedImage(dto.imagePublicId, 'reviews', userId)
      : null;
    let review: Review;
    try {
      review = await this.reviewsRepository.create({
        product: productId as any,
        user: userId as any,
        rating: dto.rating,
        title: dto.title ?? null,
        comment: dto.comment ?? null,
        reviewerName: userName,
        isVerifiedPurchase: true,
        imageUrl: image?.url ?? null,
        imagePublicId: image?.publicId ?? null,
        moderationStatus: 'approved',
        moderationReason: null,
        moderatedAt: null,
        moderatedBy: null,
        deletedAt: null,
      } as any);
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        throw new ConflictException('You have already reviewed this product');
      }
      throw error;
    }

    await this.syncProductRating(productId);

    return this.toDto(review);
  }

  async findPendingReviews(userId: string, page = 1, limit = 20) {
    const orders = await this.prisma.order.findMany({
      where: { userId, status: OrderStatus.DELIVERED, deletedAt: null },
      select: { orderRef: true, items: true, timeline: true, createdAt: true },
      orderBy: { updatedAt: 'desc' },
    });

    const candidates = new Map<
      string,
      {
        productId: string;
        name: string;
        thumbnailUrl: string | null;
        orderRef: string;
        deliveredAt: Date | null;
      }
    >();
    for (const order of orders) {
      const timeline = Array.isArray(order.timeline) ? (order.timeline as any[]) : [];
      const orderItems = Array.isArray(order.items) ? (order.items as any[]) : [];
      const deliveredAt =
        [...timeline].reverse().find((entry) => entry.status === OrderStatus.DELIVERED)
          ?.timestamp ?? null;
      for (const item of orderItems) {
        if (!item.productId || candidates.has(item.productId)) continue;
        candidates.set(item.productId, {
          productId: item.productId,
          name: item.name,
          thumbnailUrl: item.thumbnailUrl,
          orderRef: order.orderRef,
          deliveredAt,
        });
      }
    }
    const candidateItems = Array.from(candidates.values());
    const reviewedIds = new Set(
      await this.reviewsRepository.findReviewedProductIds(
        userId,
        candidateItems.map((item) => item.productId),
      ),
    );
    const pending = candidateItems.filter((item) => !reviewedIds.has(item.productId));
    const totalItems = pending.length;
    const offset = (page - 1) * limit;
    return {
      items: pending.slice(offset, offset + limit),
      pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };
  }

  async findByProduct(productId: string, sort: ReviewSortOption, page: number, limit: number) {
    const [{ items, totalItems }, summary] = await Promise.all([
      this.reviewsRepository.findByProduct(productId, sort, page, limit),
      this.reviewsRepository.getSummary(productId),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    return {
      summary,
      items: items.map((r: Review) => ({
        id: (r as unknown as { _id: { toString(): string } })._id.toString(),
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        reviewerName: r.reviewerName,
        createdAt: r.createdAt,
        isVerifiedPurchase: r.isVerifiedPurchase,
        helpfulCount: (r as any).helpfulCount ?? 0,
        imageUrl: (r as any).imageUrl ?? null,
        sellerReply: (r as any).sellerReply ?? null,
        sellerReplyAt: (r as any).sellerReplyAt ?? null,
      })),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async markHelpful(reviewId: string, userId: string, productId: string) {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, productId, deletedAt: null, status: 'approved' },
      select: { id: true },
    });
    if (!review) throw new NotFoundException('Review not found');
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.reviewHelpfulVote.create({
          data: { id: createPublicId(), reviewId, userId },
        });
        await tx.review.update({
          where: { id: reviewId },
          data: { helpfulCount: { increment: 1 } },
        });
      });
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') throw error;
    }
    const updated = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { helpfulCount: true },
    });
    return { helpfulCount: updated?.helpfulCount ?? 0 };
  }

  async updateOwnReview(reviewId: string, userId: string, dto: UpdateReviewDto) {
    const review = await this.reviewsRepository.findById(reviewId);
    if (!review || review.deletedAt) {
      throw new NotFoundException('Review not found');
    }

    if ((review.user as any)?.toString() !== userId) {
      throw new ForbiddenException('You do not own this review');
    }

    const image = dto.imagePublicId
      ? this.uploadService.resolveOwnedImage(dto.imagePublicId, 'reviews', userId)
      : undefined;
    const previousImagePublicId = (review as any).imagePublicId as string | null | undefined;
    const updated = await this.reviewsRepository.update(reviewId, {
      rating: dto.rating ?? review.rating,
      title: dto.title ?? review.title,
      comment: dto.comment ?? review.comment,
      ...(dto.imagePublicId !== undefined
        ? { imageUrl: image?.url ?? null, imagePublicId: image?.publicId ?? null }
        : {}),
      moderationStatus: 'approved',
      moderationReason: null,
      moderatedAt: null,
      moderatedBy: null,
    } as any);
    if (!updated) {
      throw new NotFoundException('Review not found');
    }
    if (previousImagePublicId && previousImagePublicId !== (updated as any).imagePublicId) {
      await this.uploadService.deleteFile(previousImagePublicId);
    }

    await this.syncProductRating((updated.product as any).toString());
    return this.toDto(updated);
  }

  async deleteOwnReview(reviewId: string, userId: string): Promise<void> {
    const review = await this.reviewsRepository.findById(reviewId);
    if (!review || review.deletedAt) {
      throw new NotFoundException('Review not found');
    }

    if ((review.user as any)?.toString() !== userId) {
      throw new ForbiddenException('You do not own this review');
    }

    await this.reviewsRepository.update(reviewId, {
      deletedAt: new Date(),
      moderationStatus: 'deleted',
      moderationReason: null,
      moderatedAt: null,
      moderatedBy: null,
    } as any);
    if ((review as any).imagePublicId)
      await this.uploadService.deleteFile((review as any).imagePublicId);
    await this.syncProductRating((review.product as any).toString());
  }

  async moderateReview(reviewId: string, adminUserId: string, dto: ModerateReviewDto) {
    const review = await this.reviewsRepository.findById(reviewId);
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    const isHidden = dto.action === 'hide';
    const updated = await this.reviewsRepository.update(reviewId, {
      deletedAt: isHidden ? new Date() : null,
      moderationStatus: isHidden ? 'hidden' : 'approved',
      moderationReason: dto.reason?.trim() ? dto.reason.trim() : null,
      moderatedAt: new Date(),
      moderatedBy: adminUserId as any,
    } as any);
    if (!updated) {
      throw new NotFoundException('Review not found');
    }

    if (isHidden) {
      await this.prisma.reviewReport.updateMany({
        where: { reviewId, status: 'pending' },
        data: { status: 'resolved_hidden', resolvedAt: new Date(), resolvedById: adminUserId },
      });
    }

    await this.syncProductRating((updated.product as any).toString());
    return this.toDto(updated);
  }

  async listSellerReviews(
    userId: string,
    productId: string,
    filter: string,
    page: number,
    limit: number,
  ) {
    await this.assertSellerOwnsProduct(userId, productId);
    const where: any = { productId, deletedAt: null };
    if (/^[1-5]$/.test(filter)) where.rating = Number(filter);
    else if (filter === 'unreplied') where.sellerReply = null;
    else if (filter === 'flagged') where.reports = { some: { status: 'pending' } };
    else if (filter !== 'all') throw new BadRequestException('Unsupported review filter');

    const [items, totalItems] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: {
          user: { select: { firstName: true, lastName: true } },
          reports: { where: { status: 'pending' }, select: { id: true, reportedAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.review.count({ where }),
    ]);
    type SellerReviewRow = {
      id: string;
      productId: string;
      rating: number;
      title: string | null;
      comment: string;
      user: { firstName: string; lastName: string };
      createdAt: Date;
      isVerified: boolean;
      imageUrl: string | null;
      helpfulCount: number;
      sellerReply: string | null;
      sellerReplyAt: Date | null;
      reports: Array<{ id: string; reportedAt: Date }>;
    };
    return {
      items: items.map((review: SellerReviewRow) => ({
        id: review.id,
        productId: review.productId,
        rating: review.rating,
        title: review.title,
        comment: review.comment,
        reviewerName: [review.user.firstName, review.user.lastName].filter(Boolean).join(' '),
        createdAt: review.createdAt,
        isVerifiedPurchase: review.isVerified,
        imageUrl: review.imageUrl,
        helpfulCount: review.helpfulCount,
        sellerReply: review.sellerReply,
        sellerReplyAt: review.sellerReplyAt,
        isFlagged: review.reports.length > 0,
      })),
      pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };
  }

  async createSellerReply(userId: string, productId: string, reviewId: string, reply: string) {
    await this.assertSellerOwnsProduct(userId, productId);
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, productId, deletedAt: null },
      select: { id: true, sellerReply: true },
    });
    if (!review) throw new NotFoundException('Review not found');
    const changed = await this.prisma.review.updateMany({
      where: { id: reviewId, productId, deletedAt: null, sellerReply: null },
      data: { sellerReply: reply.trim(), sellerReplyAt: new Date(), sellerReplyById: userId },
    });
    if (!changed.count) throw new ConflictException('A reply already exists; edit it instead');
    return this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, sellerReply: true, sellerReplyAt: true },
    });
  }

  async updateSellerReply(userId: string, productId: string, reviewId: string, reply: string) {
    await this.assertSellerOwnsProduct(userId, productId);
    const updated = await this.prisma.review.updateMany({
      where: { id: reviewId, productId, deletedAt: null, sellerReplyById: userId },
      data: { sellerReply: reply.trim(), sellerReplyAt: new Date() },
    });
    if (!updated.count) throw new NotFoundException('Your reply was not found');
    return this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, sellerReply: true, sellerReplyAt: true },
    });
  }

  async deleteSellerReply(userId: string, productId: string, reviewId: string) {
    await this.assertSellerOwnsProduct(userId, productId);
    const updated = await this.prisma.review.updateMany({
      where: { id: reviewId, productId, deletedAt: null, sellerReplyById: userId },
      data: { sellerReply: null, sellerReplyAt: null, sellerReplyById: null },
    });
    if (!updated.count) throw new NotFoundException('Your reply was not found');
  }

  async reportSellerReview(userId: string, productId: string, reviewId: string) {
    await this.assertSellerOwnsProduct(userId, productId);
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, productId, deletedAt: null },
      select: { id: true, userId: true },
    });
    if (!review) throw new NotFoundException('Review not found');
    if (review.userId === userId) throw new ForbiddenException('You cannot report your own review');
    const existing = await this.prisma.reviewReport.findFirst({
      where: { reviewId, reportedById: userId, status: 'pending' },
      select: { id: true, status: true, reportedAt: true },
    });
    if (existing) return existing;
    try {
      return await this.prisma.reviewReport.create({
        data: { id: createPublicId(), reviewId, reportedById: userId },
        select: { id: true, status: true, reportedAt: true },
      });
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') throw error;
      return this.prisma.reviewReport.findFirstOrThrow({
        where: { reviewId, reportedById: userId, status: 'pending' },
        select: { id: true, status: true, reportedAt: true },
      });
    }
  }

  async cancelSellerReviewReport(userId: string, productId: string, reviewId: string) {
    await this.assertSellerOwnsProduct(userId, productId);
    const report = await this.prisma.reviewReport.findFirst({
      where: { reviewId, reportedById: userId, status: 'pending', review: { productId } },
      select: { id: true },
    });
    if (!report) throw new NotFoundException('Pending report not found');
    const withdrawn = await this.prisma.reviewReport.updateMany({
      where: { id: report.id, status: 'pending', reportedById: userId },
      data: { status: 'withdrawn', withdrawnAt: new Date() },
    });
    if (!withdrawn.count) throw new ConflictException('The report was already reviewed');
    return { id: report.id, status: 'withdrawn' };
  }

  async listPendingReviewReports(page: number, limit: number) {
    const where = { status: 'pending' };
    const [reports, totalItems] = await Promise.all([
      this.prisma.reviewReport.findMany({
        where,
        include: {
          review: {
            include: {
              product: { select: { id: true, name: true, seller: { select: { name: true } } } },
              user: { select: { firstName: true, lastName: true } },
            },
          },
          reportedBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { reportedAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.reviewReport.count({ where }),
    ]);
    return {
      items: reports,
      pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };
  }

  async resolveReviewReport(
    reportId: string,
    adminId: string,
    action: 'leave_visible' | 'hide_review',
    reason?: string,
  ) {
    const report = await this.prisma.reviewReport.findFirst({
      where: { id: reportId, status: 'pending' },
      select: { id: true, reviewId: true },
    });
    if (!report) throw new NotFoundException('Pending review report not found');
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.reviewReport.updateMany({
        where: { id: report.id, status: 'pending' },
        data: {
          status: action === 'hide_review' ? 'resolved_hidden' : 'resolved_visible',
          resolvedAt: now,
          resolvedById: adminId,
          resolution: reason?.trim() || null,
        },
      });
      if (!claimed.count) throw new ConflictException('The report was already resolved');
      if (action === 'hide_review') {
        await tx.review.update({
          where: { id: report.reviewId },
          data: {
            deletedAt: now,
            status: 'hidden',
            moderationReason: reason?.trim() || 'Hidden after report review',
            moderatedAt: now,
            moderatedById: adminId,
          },
        });
        await tx.reviewReport.updateMany({
          where: { reviewId: report.reviewId, status: 'pending', id: { not: report.id } },
          data: {
            status: 'resolved_hidden',
            resolvedAt: now,
            resolvedById: adminId,
            resolution: reason?.trim() || 'Review hidden after report review',
          },
        });
      }
    });
    if (action === 'hide_review') {
      const review = await this.prisma.review.findUnique({
        where: { id: report.reviewId },
        select: { productId: true },
      });
      if (review) await this.syncProductRating(review.productId);
    }
    return {
      id: report.id,
      status: action === 'hide_review' ? 'resolved_hidden' : 'resolved_visible',
    };
  }

  private async assertSellerOwnsProduct(userId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null, seller: { ownerId: userId, deletedAt: null } },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Seller product not found');
  }

  private async syncProductRating(productId: string): Promise<void> {
    const stats = await this.reviewsRepository.getSummary(productId);
    await this.prisma.product.updateMany({
      where: { id: productId },
      data: { rating: stats.averageRating, reviewCount: stats.totalReviews },
    });
  }

  private toDto(review: Review) {
    const id = (review as unknown as { _id: { toString(): string } })._id.toString();
    return {
      id,
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      reviewerName: review.reviewerName,
      isVerifiedPurchase: review.isVerifiedPurchase,
      helpfulCount: review.helpfulCount ?? 0,
      moderationStatus: (review as any).moderationStatus ?? 'approved',
      moderationReason: (review as any).moderationReason ?? null,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
      moderatedAt: (review as any).moderatedAt ?? null,
      imageUrl: (review as any).imageUrl ?? null,
      sellerReply: (review as any).sellerReply ?? null,
      sellerReplyAt: (review as any).sellerReplyAt ?? null,
    };
  }
}
