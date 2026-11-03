import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '@database/prisma.service';
import { createPublicId } from '@database/id.util';
import { CartOwnerType } from './schemas/cart.schema';

const cartInclude = { items: { include: { product: true } } } satisfies Prisma.CartInclude;
export type CartRow = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

const GUEST_CART_TTL_DAYS = 30;

@Injectable()
export class CartRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUser(userId: string): Promise<CartRow | null> {
    return this.prisma.cart.findFirst({
      where: { userId, deletedAt: null },
      include: cartInclude,
    });
  }

  async findByPublicId(publicCartId: string): Promise<CartRow | null> {
    return this.prisma.cart.findFirst({
      where: { publicCartId, deletedAt: null },
      include: cartInclude,
    });
  }

  async findByPublicIdWithGuestHash(publicCartId: string): Promise<CartRow | null> {
    return this.findByPublicId(publicCartId);
  }

  async findOrCreateForUser(userId: string): Promise<CartRow> {
    const existing = await this.findByUser(userId);
    if (existing) return existing;
    return this.prisma.cart.create({
      data: {
        id: createPublicId(),
        userId,
        ownerType: CartOwnerType.USER,
        publicCartId: createPublicId(),
      },
      include: cartInclude,
    });
  }

  async createGuest(guestTokenHash: string): Promise<CartRow> {
    const expiresAt = new Date(Date.now() + GUEST_CART_TTL_DAYS * 24 * 60 * 60 * 1000);
    return this.prisma.cart.create({
      data: {
        id: createPublicId(),
        ownerType: CartOwnerType.GUEST,
        publicCartId: createPublicId(),
        guestTokenHash,
        expiresAt,
      },
      include: cartInclude,
    });
  }

  async addItemByCartId(
    cartId: string,
    productId: string,
    variantId: string | null,
    quantity: number,
  ): Promise<CartRow | null> {
    const cart = await this.prisma.cart.findFirst({
      where: { publicCartId: cartId, deletedAt: null },
    });
    if (!cart) return null;

    const existing = await this.prisma.cartItem.findFirst({
      where: { cartId: cart.id, productId, variantId },
    });
    if (existing) {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: { increment: quantity } },
      });
    } else {
      await this.prisma.cartItem.create({
        data: { id: createPublicId(), cartId: cart.id, productId, variantId, quantity },
      });
    }
    return this.findByPublicId(cartId);
  }

  async updateItemQuantityByCartId(
    cartId: string,
    itemId: string,
    quantity: number,
  ): Promise<CartRow | null> {
    const cart = await this.prisma.cart.findFirst({
      where: { publicCartId: cartId, deletedAt: null },
    });
    if (!cart) return null;
    const result = await this.prisma.cartItem.updateMany({
      where: { id: itemId, cartId: cart.id },
      data: { quantity },
    });
    if (result.count === 0) return null;
    return this.findByPublicId(cartId);
  }

  async removeItemByCartId(cartId: string, itemId: string): Promise<CartRow | null> {
    const cart = await this.prisma.cart.findFirst({
      where: { publicCartId: cartId, deletedAt: null },
    });
    if (!cart) return null;
    const result = await this.prisma.cartItem.deleteMany({
      where: { id: itemId, cartId: cart.id },
    });
    if (result.count === 0) return null;
    return this.findByPublicId(cartId);
  }

  async clearItemsByCartId(cartId: string): Promise<CartRow | null> {
    const cart = await this.prisma.cart.findFirst({
      where: { publicCartId: cartId, deletedAt: null },
    });
    if (!cart) return null;
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.findByPublicId(cartId);
  }

  async deleteByPublicId(publicCartId: string): Promise<void> {
    await this.prisma.cart.deleteMany({ where: { publicCartId } });
  }

  async addItem(
    userId: string,
    productId: string,
    variantId: string | null,
    quantity: number,
  ): Promise<CartRow> {
    const cart = await this.findOrCreateForUser(userId);
    const updated = await this.addItemByCartId(cart.publicCartId, productId, variantId, quantity);
    if (!updated) throw new Error('Cart disappeared while adding an item');
    return updated;
  }

  async updateItemQuantity(
    userId: string,
    itemId: string,
    quantity: number,
  ): Promise<CartRow | null> {
    const cart = await this.findByUser(userId);
    return cart ? this.updateItemQuantityByCartId(cart.publicCartId, itemId, quantity) : null;
  }

  async removeItem(userId: string, itemId: string): Promise<CartRow | null> {
    const cart = await this.findByUser(userId);
    return cart ? this.removeItemByCartId(cart.publicCartId, itemId) : null;
  }

  async claimGuestForUser(guestPublicId: string, userId: string): Promise<CartRow | null> {
    const [userCart, guestCart] = await Promise.all([
      this.findOrCreateForUser(userId),
      this.findByPublicId(guestPublicId),
    ]);
    if (!guestCart || guestCart.ownerType !== CartOwnerType.GUEST) return null;

    await this.prisma.$transaction(async (tx) => {
      for (const item of guestCart.items) {
        const existing = await tx.cartItem.findFirst({
          where: { cartId: userCart.id, productId: item.productId, variantId: item.variantId },
        });
        if (existing) {
          await tx.cartItem.update({
            where: { id: existing.id },
            data: { quantity: { increment: item.quantity } },
          });
        } else {
          await tx.cartItem.create({
            data: {
              id: createPublicId(),
              cartId: userCart.id,
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
            },
          });
        }
      }
      await tx.cart.delete({ where: { id: guestCart.id } });
    });
    return this.findByUser(userId);
  }
}
