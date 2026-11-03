import { Injectable, NotFoundException } from '@nestjs/common';
import { WishlistRepository } from './wishlist.repository';
import { ProductsService } from '@products/products.service';

@Injectable()
export class WishlistService {
  constructor(
    private readonly wishlistRepository: WishlistRepository,
    private readonly productsService: ProductsService,
  ) {}

  async getWishlist(userId: string, page = 1, limit = 20) {
    const { items, totalItems } = await this.wishlistRepository.findByUser(userId, page, limit);
    const visible = items.filter((item) => item.product);
    return {
      items: visible.map((item) => ({
        productId: item.product.id,
        addedAt: item.createdAt,
        product: this.productsService.toCard({
          ...item.product,
          _id: { toString: () => item.product.id },
          seller: {
            ...item.product.seller,
            _id: { toString: () => item.product.seller.id },
          },
        } as never),
      })),
      pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };
  }

  async addToWishlist(userId: string, productId: string) {
    await this.wishlistRepository.add(userId, productId);
    return { message: 'Added to wishlist' };
  }

  async removeFromWishlist(userId: string, productId: string) {
    const removed = await this.wishlistRepository.remove(userId, productId);
    if (!removed) throw new NotFoundException('Wishlist item not found');
    return { message: 'Removed from wishlist' };
  }
}
