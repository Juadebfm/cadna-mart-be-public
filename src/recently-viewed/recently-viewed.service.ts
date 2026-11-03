import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { ProductsService } from '@products/products.service';
import { RecentlyViewedRepository } from './recently-viewed.repository';

@Injectable()
export class RecentlyViewedService {
  constructor(
    private readonly repository: RecentlyViewedRepository,
    private readonly productsService: ProductsService,
    private readonly prisma: PrismaService,
  ) {}

  async record(userId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
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
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    await this.repository.record(userId, productId);
    return { recorded: true };
  }

  async list(userId: string, page: number, limit: number) {
    const { items, totalItems } = await this.repository.findByUser(userId, page, limit);
    const visible = items
      .filter((item) => item.product)
      .map((item) => {
        const product = item.product;
        const productForCard = {
          ...product,
          _id: { toString: () => product.id },
          seller: product.seller
            ? { ...product.seller, _id: { toString: () => product.seller.id } }
            : null,
        } as any;
        return {
          productId: product.id,
          viewedAt: item.viewedAt,
          product: this.productsService.toCard(productForCard),
        };
      });
    return {
      items: visible,
      pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };
  }
}
