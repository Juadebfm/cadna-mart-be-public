import { ForbiddenException } from '@nestjs/common';
import { ReviewsService } from './reviews.service';

describe('ReviewsService', () => {
  const userId = 'a'.repeat(24);
  const productId = 'b'.repeat(24);
  const reviewId = 'c'.repeat(24);
  let repository: any;
  let prisma: any;
  let uploadService: any;
  let service: ReviewsService;

  beforeEach(() => {
    repository = {
      findByUserAndProduct: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        _id: { toString: () => reviewId },
        product: productId,
        user: userId,
        rating: 5,
        title: 'Great',
        comment: 'Exactly as described',
        reviewerName: 'Ada Okafor',
        isVerifiedPurchase: true,
        helpfulCount: 0,
        moderationStatus: 'approved',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      getSummary: jest.fn().mockResolvedValue({ averageRating: 5, totalReviews: 1 }),
    };
    prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: productId }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      order: { findMany: jest.fn().mockResolvedValue([{ items: [{ productId }] }]) },
      review: {
        findFirst: jest.fn().mockResolvedValue({ id: reviewId }),
        findUnique: jest.fn().mockResolvedValue({ helpfulCount: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      reviewHelpfulVote: { create: jest.fn().mockResolvedValue({}) },
      reviewReport: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'd'.repeat(24), status: 'pending' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(async (callback) =>
        callback({
          reviewHelpfulVote: prisma.reviewHelpfulVote,
          review: { update: jest.fn().mockResolvedValue({}) },
        }),
      ),
    };
    uploadService = {
      resolveOwnedImage: jest.fn().mockReturnValue({
        url: 'https://images.test/review.jpg',
        publicId: 'cadna-mart/reviews/user-a/photo',
      }),
      deleteFile: jest.fn(),
    };
    service = new ReviewsService(repository, prisma, uploadService);
  });

  it('requires a delivered order containing the product before creating a review', async () => {
    prisma.order.findMany.mockResolvedValueOnce([{ items: [{ productId: 'd'.repeat(24) }] }]);

    await expect(
      service.createReview(productId, userId, 'Ada Okafor', { rating: 5 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('creates only verified purchase reviews and attaches an owned optional photo', async () => {
    await service.createReview(productId, userId, 'Ada Okafor', {
      rating: 5,
      imagePublicId: 'cadna-mart/reviews/user-a/photo',
    });

    expect(uploadService.resolveOwnedImage).toHaveBeenCalledWith(
      'cadna-mart/reviews/user-a/photo',
      'reviews',
      userId,
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        isVerifiedPurchase: true,
        imagePublicId: 'cadna-mart/reviews/user-a/photo',
      }),
    );
  });

  it('counts a Helpful vote only when the unique buyer vote is newly created', async () => {
    const update = jest.fn().mockResolvedValue({});
    prisma.$transaction.mockImplementationOnce((callback: (tx: any) => unknown) =>
      callback({ reviewHelpfulVote: prisma.reviewHelpfulVote, review: { update } }),
    );
    await service.markHelpful(reviewId, userId, productId);
    expect(prisma.reviewHelpfulVote.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reviewId, userId }),
    });
    expect(update).toHaveBeenCalledTimes(1);

    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
    await service.markHelpful(reviewId, userId, productId);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('authorizes seller review actions through the product owner and creates a report once', async () => {
    prisma.review.findFirst.mockResolvedValueOnce({ id: reviewId, userId: 'e'.repeat(24) });
    const report = await service.reportSellerReview(userId, productId, reviewId);
    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: { id: productId, deletedAt: null, seller: { ownerId: userId, deletedAt: null } },
      select: { id: true },
    });
    expect(prisma.reviewReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reviewId, reportedById: userId }),
      select: expect.any(Object),
    });
    expect(report.status).toBe('pending');
  });

  it('does not let a different seller access a product review', async () => {
    prisma.product.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.createSellerReply(userId, productId, reviewId, 'Thanks for your feedback'),
    ).rejects.toThrow('Seller product not found');
    expect(prisma.review.updateMany).not.toHaveBeenCalled();
  });

  it('hides a reported review and resolves the pending report in one transaction', async () => {
    const reportId = 'f'.repeat(24);
    const reviewUpdate = jest.fn().mockResolvedValue({});
    const reportUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const closeOtherReports = jest.fn().mockResolvedValue({ count: 0 });
    prisma.reviewReport.findFirst.mockResolvedValueOnce({ id: reportId, reviewId });
    prisma.$transaction.mockImplementationOnce((callback: (tx: any) => unknown) =>
      callback({
        reviewReport: { updateMany: reportUpdateMany },
        review: { update: reviewUpdate },
      }),
    );
    prisma.reviewReport.updateMany.mockImplementationOnce(closeOtherReports);
    prisma.review.findUnique.mockResolvedValueOnce({ productId });

    const result = await service.resolveReviewReport(reportId, userId, 'hide_review');

    expect(reportUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: reportId, status: 'pending' } }),
    );
    expect(reviewUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: reviewId },
        data: expect.objectContaining({ status: 'hidden', moderatedById: userId }),
      }),
    );
    expect(result.status).toBe('resolved_hidden');
  });
});
