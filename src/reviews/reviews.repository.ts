import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { createPublicId } from '@database/id.util';
import { Review } from './schemas/review.schema';

export type ReviewSortOption = 'most_recent' | 'highest_rating' | 'lowest_rating' | 'most_helpful';

@Injectable()
export class ReviewsRepository {
  constructor(public readonly prisma: PrismaService) {}
  private legacy(row: any): Review | null {
    return row
      ? ({
          ...row,
          _id: row.id,
          product: row.productId,
          user: row.userId,
          isVerifiedPurchase: row.isVerified,
          moderationStatus: row.status,
          moderatedBy: row.moderatedById,
        } as unknown as Review)
      : null;
  }
  private mapUpdate(input: any) {
    const data = { ...input };
    for (const [oldName, newName] of [
      ['product', 'productId'],
      ['user', 'userId'],
      ['isVerifiedPurchase', 'isVerified'],
      ['moderationStatus', 'status'],
      ['moderatedBy', 'moderatedById'],
    ]) {
      if (oldName in data) {
        data[newName] = typeof data[oldName] === 'string' ? data[oldName] : String(data[oldName]);
        delete data[oldName];
      }
    }
    return data;
  }
  async create(data: Partial<Review>): Promise<Review> {
    const value: any = this.mapUpdate(data);
    return this.legacy(
      await this.prisma.review.create({
        data: {
          id: createPublicId(),
          productId: value.productId,
          userId: value.userId,
          rating: value.rating,
          title: value.title ?? null,
          comment: value.comment ?? '',
          reviewerName: value.reviewerName ?? '',
          isVerified: value.isVerified ?? false,
          helpfulCount: value.helpfulCount ?? 0,
          status: value.status ?? 'approved',
          moderationReason: value.moderationReason ?? null,
          moderatedAt: value.moderatedAt ?? null,
          moderatedById: value.moderatedById ?? null,
          deletedAt: value.deletedAt ?? null,
        },
      }),
    )!;
  }
  async findByProduct(productId: string, sort: ReviewSortOption, page: number, limit: number) {
    const where = { productId, deletedAt: null, status: 'approved' };
    const orderBy: any =
      sort === 'highest_rating'
        ? [{ rating: 'desc' }, { createdAt: 'desc' }]
        : sort === 'lowest_rating'
          ? [{ rating: 'asc' }, { createdAt: 'desc' }]
          : sort === 'most_helpful'
            ? [{ helpfulCount: 'desc' }, { createdAt: 'desc' }]
            : { createdAt: 'desc' };
    const [rows, totalItems] = await Promise.all([
      this.prisma.review.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit }),
      this.prisma.review.count({ where }),
    ]);
    return { items: rows.map((row) => this.legacy(row)!), totalItems };
  }
  async findByUserAndProduct(userId: string, productId: string): Promise<Review | null> {
    return this.legacy(
      await this.prisma.review.findFirst({ where: { userId, productId, deletedAt: null } }),
    );
  }
  async findReviewedProductIds(userId: string, productIds: string[]): Promise<string[]> {
    if (!productIds.length) return [];
    const rows = await this.prisma.review.findMany({
      where: { userId, productId: { in: productIds }, deletedAt: null },
      select: { productId: true },
    });
    return rows.map((row) => row.productId);
  }
  async findById(id: string): Promise<Review | null> {
    return this.legacy(await this.prisma.review.findUnique({ where: { id } }));
  }
  async update(id: string, data: Partial<Review>): Promise<Review | null> {
    try {
      return this.legacy(
        await this.prisma.review.update({ where: { id }, data: this.mapUpdate(data as any) }),
      );
    } catch {
      return null;
    }
  }
  async incrementHelpful(id: string): Promise<Review | null> {
    const changed = await this.prisma.review.updateMany({
      where: { id, deletedAt: null },
      data: { helpfulCount: { increment: 1 } },
    });
    return changed.count ? this.findById(id) : null;
  }
  async getSummary(productId: string) {
    const [stats, groups] = await Promise.all([
      this.prisma.review.aggregate({
        where: { productId, deletedAt: null, status: 'approved' },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      this.prisma.review.groupBy({
        by: ['rating'],
        where: { productId, deletedAt: null, status: 'approved' },
        _count: { _all: true },
      }),
    ]);
    const breakdown: Record<string, number> = { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 };
    for (const row of groups) breakdown[String(row.rating)] = row._count._all;
    return {
      averageRating: stats._avg.rating ? Math.round(stats._avg.rating * 10) / 10 : 0,
      totalReviews: stats._count._all,
      breakdown,
    };
  }
}
