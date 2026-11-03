import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { createPublicId } from '@database/id.util';

const MAX_RECENT_PRODUCTS = 100;

@Injectable()
export class RecentlyViewedRepository {
  constructor(private readonly prisma: PrismaService) {}

  async record(userId: string, productId: string): Promise<void> {
    await this.prisma.recentlyViewed.upsert({
      where: { userId_productId: { userId, productId } },
      create: { id: createPublicId(), userId, productId, viewedAt: new Date() },
      update: { viewedAt: new Date() },
    });

    const stale = await this.prisma.recentlyViewed.findMany({
      where: { userId },
      orderBy: { viewedAt: 'desc' },
      skip: MAX_RECENT_PRODUCTS,
      select: { id: true },
    });
    if (stale.length)
      await this.prisma.recentlyViewed.deleteMany({
        where: { id: { in: stale.map(({ id }) => id) } },
      });
  }

  async findByUser(userId: string, page: number, limit: number) {
    const filter = {
      userId,
      product: {
        deletedAt: null,
        isActive: true,
        publicationStatus: 'live',
        isDeactivated: false,
        moderationStatus: 'approved',
        seller: {
          is: {
            isActive: true,
            deletedAt: null,
            owner: {
              is: {
                sellerProfile: {
                  is: {
                    deletedAt: null,
                    applicationStatus: 'approved',
                    isApproved: true,
                    kycStatus: 'verified',
                  },
                },
              },
            },
          },
        },
      },
    };
    const [items, totalItems] = await Promise.all([
      this.prisma.recentlyViewed.findMany({
        where: filter,
        include: { product: { include: { seller: true } } },
        orderBy: { viewedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.recentlyViewed.count({ where: filter }),
    ]);
    return { items, totalItems };
  }
}
