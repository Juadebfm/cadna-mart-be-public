import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { createPublicId } from '@database/id.util';
import { Seller } from './schemas/seller.schema';

@Injectable()
export class SellersRepository {
  constructor(public readonly prisma: PrismaService) {}

  private legacy(row: any): Seller | null {
    return row ? ({ ...row, _id: row.id, owner: row.ownerId } as unknown as Seller) : null;
  }

  async findById(id: string): Promise<Seller | null> {
    return this.legacy(await this.prisma.seller.findFirst({ where: { id, deletedAt: null } }));
  }

  async findBySlug(slug: string): Promise<Seller | null> {
    return this.legacy(await this.prisma.seller.findFirst({ where: { slug, deletedAt: null } }));
  }

  async findByOwner(ownerId: string): Promise<Seller | null> {
    return this.legacy(await this.prisma.seller.findFirst({ where: { ownerId, deletedAt: null } }));
  }

  async create(data: Partial<Seller>): Promise<Seller> {
    const value = data as any;
    const row = await this.prisma.seller.create({
      data: {
        id: createPublicId(),
        name: value.name,
        slug: value.slug,
        ownerId: value.owner,
        logoUrl: value.logoUrl ?? null,
        isVerified: value.isVerified ?? false,
        responseRatePercent: value.responseRatePercent ?? 0,
        averageRating: value.averageRating ?? 0,
        reviewCount: value.reviewCount ?? 0,
        followerCount: value.followerCount ?? 0,
        joinedYear: value.joinedYear ?? null,
        location: value.location ?? null,
        deliveryTimeRange: value.deliveryTimeRange ?? null,
        isActive: value.isActive ?? true,
        deletedAt: value.deletedAt ?? null,
      },
    });
    return this.legacy(row)!;
  }

  async update(id: string, data: Partial<Seller>): Promise<Seller | null> {
    const mapped: any = { ...(data as any) };
    if ('owner' in mapped) {
      mapped.ownerId = mapped.owner;
      delete mapped.owner;
    }
    try {
      return this.legacy(await this.prisma.seller.update({ where: { id }, data: mapped }));
    } catch {
      return null;
    }
  }

  async follow(userId: string, sellerId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.sellerFollower.create({ data: { id: createPublicId(), userId, sellerId } });
      await tx.seller.update({
        where: { id: sellerId },
        data: { followerCount: { increment: 1 } },
      });
    });
  }

  async unfollow(userId: string, sellerId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const removed = await tx.sellerFollower.deleteMany({ where: { userId, sellerId } });
      if (removed.count)
        await tx.seller.update({
          where: { id: sellerId },
          data: { followerCount: { decrement: 1 } },
        });
      return removed.count > 0;
    });
  }

  async isFollowing(userId: string, sellerId: string): Promise<boolean> {
    return (await this.prisma.sellerFollower.count({ where: { userId, sellerId } })) > 0;
  }

  async findFollowedByUser(userId: string, page = 1, limit = 20) {
    const where = { userId };
    const [items, totalItems] = await Promise.all([
      this.prisma.sellerFollower.findMany({
        where,
        include: { seller: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.sellerFollower.count({ where }),
    ]);
    return {
      items: items.map((item) => ({
        ...item,
        _id: item.id,
        user: item.userId,
        seller: this.legacy(item.seller),
      })) as any,
      totalItems,
    };
  }
}
