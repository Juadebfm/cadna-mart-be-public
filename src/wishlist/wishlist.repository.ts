import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '@database/prisma.service';
import { createPublicId } from '@database/id.util';

const wishlistInclude = {
  product: { include: { seller: true } },
} satisfies Prisma.WishlistItemInclude;
export type WishlistRow = Prisma.WishlistItemGetPayload<{ include: typeof wishlistInclude }>;

@Injectable()
export class WishlistRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUser(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ items: WishlistRow[]; totalItems: number }> {
    const where = { userId };
    const [items, totalItems] = await Promise.all([
      this.prisma.wishlistItem.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: wishlistInclude,
      }),
      this.prisma.wishlistItem.count({ where }),
    ]);
    return { items, totalItems };
  }

  async add(userId: string, productId: string): Promise<WishlistRow> {
    return this.prisma.wishlistItem.upsert({
      where: { userId_productId: { userId, productId } },
      create: { id: createPublicId(), userId, productId },
      update: {},
      include: wishlistInclude,
    });
  }

  async remove(userId: string, productId: string): Promise<boolean> {
    const result = await this.prisma.wishlistItem.deleteMany({ where: { userId, productId } });
    return result.count > 0;
  }
}
