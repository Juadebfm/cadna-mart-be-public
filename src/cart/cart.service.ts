import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { randomBytes } from 'crypto';
import { CartRepository } from './cart.repository';
import { CartOwnerType } from './schemas/cart.schema';
import { CartRow } from './cart.repository';
import { PrismaService } from '@database/prisma.service';
import { ConfigService } from '@config/config.service';
import { comparePassword, hashPassword } from '@common/utils/hash.util';

export interface MoneyDto {
  amount: number;
  currency: string;
  formatted: string;
}

const DEFAULT_TAX_RATE = 0.075; // 7.5% VAT placeholder until pricing engine ships
const DEFAULT_DELIVERY_ESTIMATE = 1500; // NGN flat placeholder

function formatMoney(amount: number, currency = 'NGN'): MoneyDto {
  return {
    amount,
    currency,
    formatted: `₦${Math.round(amount).toLocaleString('en-NG')}`,
  };
}

@Injectable()
export class CartService {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Auth helpers ──────────────────────────────────────────

  private async resolveUserIdFromRequest(req: Request): Promise<string | null> {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return null;
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(header.slice(7), {
        secret: this.configService.jwt.accessSecret,
      });
      return payload?.sub ?? null;
    } catch {
      return null;
    }
  }

  private async assertAccess(req: Request, cart: CartRow): Promise<{ userId: string | null }> {
    const userId = await this.resolveUserIdFromRequest(req);

    if (cart.ownerType === CartOwnerType.USER) {
      const ownerId = cart.userId?.toString();
      if (!userId || ownerId !== userId) {
        throw new ForbiddenException('You do not have access to this cart');
      }
      return { userId };
    }

    // Guest cart
    const guestToken = (req.headers['x-guest-token'] as string | undefined)?.trim();
    if (!guestToken) {
      throw new ForbiddenException('Missing x-guest-token header for guest cart');
    }
    const stored = await this.cartRepository.findByPublicIdWithGuestHash(cart.publicCartId);
    if (!stored || !stored.guestTokenHash) {
      throw new ForbiddenException('Cart not accessible');
    }
    const ok = await comparePassword(guestToken, stored.guestTokenHash);
    if (!ok) {
      throw new ForbiddenException('Invalid guest token');
    }
    return { userId };
  }

  // ─── Creation ──────────────────────────────────────────────

  async createCart(req: Request): Promise<{
    cartId: string;
    ownerType: CartOwnerType;
    guestToken?: string;
  }> {
    const userId = await this.resolveUserIdFromRequest(req);
    if (userId) {
      const cart = await this.cartRepository.findOrCreateForUser(userId);
      return { cartId: cart.publicCartId, ownerType: CartOwnerType.USER };
    }
    const guestToken = randomBytes(24).toString('hex');
    const hash = await hashPassword(guestToken);
    const cart = await this.cartRepository.createGuest(hash);
    return { cartId: cart.publicCartId, ownerType: CartOwnerType.GUEST, guestToken };
  }

  // ─── New cartId-scoped reads / writes ──────────────────────

  async getCartByPublicId(req: Request, cartId: string) {
    const cart = await this.cartRepository.findByPublicId(cartId);
    if (!cart) throw new NotFoundException('Cart not found');
    await this.assertAccess(req, cart);
    return this.toDto(cart);
  }

  async addItemByPublicId(
    req: Request,
    cartId: string,
    productId: string,
    variantId: string | null,
    quantity: number,
  ) {
    const cart = await this.cartRepository.findByPublicId(cartId);
    if (!cart) throw new NotFoundException('Cart not found');
    await this.assertAccess(req, cart);
    await this.assertProductAvailable(productId);
    const updated = await this.cartRepository.addItemByCartId(
      cartId,
      productId,
      variantId,
      quantity,
    );
    if (!updated) throw new NotFoundException('Cart not found');
    return this.toDto(updated);
  }

  async updateItemByPublicId(req: Request, cartId: string, itemId: string, quantity: number) {
    const cart = await this.cartRepository.findByPublicId(cartId);
    if (!cart) throw new NotFoundException('Cart not found');
    await this.assertAccess(req, cart);
    const updated = await this.cartRepository.updateItemQuantityByCartId(cartId, itemId, quantity);
    if (!updated) throw new NotFoundException('Cart item not found');
    return this.toDto(updated);
  }

  async removeItemByPublicId(req: Request, cartId: string, itemId: string) {
    const cart = await this.cartRepository.findByPublicId(cartId);
    if (!cart) throw new NotFoundException('Cart not found');
    await this.assertAccess(req, cart);
    const updated = await this.cartRepository.removeItemByCartId(cartId, itemId);
    if (!updated) throw new NotFoundException('Cart item not found');
    return this.toDto(updated);
  }

  async clearByPublicId(req: Request, cartId: string) {
    const cart = await this.cartRepository.findByPublicId(cartId);
    if (!cart) throw new NotFoundException('Cart not found');
    await this.assertAccess(req, cart);
    const updated = await this.cartRepository.clearItemsByCartId(cartId);
    if (!updated) throw new NotFoundException('Cart not found');
    return this.toDto(updated);
  }

  async mergeGuestIntoUser(userId: string, guestCartId: string, guestToken: string) {
    const guest = await this.cartRepository.findByPublicIdWithGuestHash(guestCartId);
    if (!guest || guest.ownerType !== CartOwnerType.GUEST) {
      throw new NotFoundException('Guest cart not found');
    }
    if (!guest.guestTokenHash) {
      throw new ForbiddenException('Guest cart not accessible');
    }
    const ok = await comparePassword(guestToken, guest.guestTokenHash);
    if (!ok) {
      throw new ForbiddenException('Invalid guest token');
    }
    const merged = await this.cartRepository.claimGuestForUser(guestCartId, userId);
    if (!merged) throw new NotFoundException('Merge failed');
    return this.toDto(merged);
  }

  async getTotalsByPublicId(req: Request, cartId: string) {
    const cart = await this.cartRepository.findByPublicId(cartId);
    if (!cart) throw new NotFoundException('Cart not found');
    await this.assertAccess(req, cart);
    const dto = this.toDto(cart);
    const subtotal = dto.totals.subtotal.amount;
    const tax = subtotal * DEFAULT_TAX_RATE;
    const delivery = subtotal > 0 ? DEFAULT_DELIVERY_ESTIMATE : 0;
    const total = subtotal + tax + delivery;
    return {
      cartId: dto.id,
      currency: 'NGN',
      subtotal: formatMoney(subtotal),
      taxAmount: formatMoney(tax),
      taxRate: DEFAULT_TAX_RATE,
      deliveryEstimate: formatMoney(delivery),
      grandTotal: formatMoney(total),
      pricingLocked: false,
      note: 'Tax and delivery use placeholder defaults until the pricing-rule engine ships.',
    };
  }

  async validateByPublicId(req: Request, cartId: string) {
    const cart = await this.cartRepository.findByPublicId(cartId);
    if (!cart) throw new NotFoundException('Cart not found');
    await this.assertAccess(req, cart);

    const issues: Array<{ itemId: string; reason: string }> = [];
    const sellerIds = [
      ...new Set(cart.items.map((item) => item.product?.sellerId).filter(Boolean)),
    ] as string[];
    const activeSellerRows = sellerIds.length
      ? await this.prisma.seller.findMany({
          where: { id: { in: sellerIds }, deletedAt: null, isActive: true },
          select: { id: true },
        })
      : [];
    const activeSellerIds = new Set(activeSellerRows.map((seller) => seller.id));
    for (const item of cart.items) {
      const product = item.product as unknown as {
        id: string;
        isActive: boolean;
        inventoryStatus: string;
        variants: Array<{ id: string; isInStock: boolean; stockQty: number }>;
      };
      const itemId = item.id;
      if (!product) {
        issues.push({ itemId, reason: 'product_missing' });
        continue;
      }
      if (!product.isActive) {
        issues.push({ itemId, reason: 'product_inactive' });
        continue;
      }
      if (!activeSellerIds.has((item.product as any).sellerId)) {
        issues.push({ itemId, reason: 'seller_unavailable' });
        continue;
      }
      if (item.variantId) {
        const variant = product.variants?.find((v) => v.id === item.variantId);
        if (!variant) {
          issues.push({ itemId, reason: 'variant_missing' });
          continue;
        }
        if (!variant.isInStock || variant.stockQty < item.quantity) {
          issues.push({ itemId, reason: 'variant_out_of_stock' });
        }
      } else if (product.inventoryStatus !== 'in_stock') {
        issues.push({ itemId, reason: 'product_out_of_stock' });
      }
    }
    return { cartId: cart.publicCartId, valid: issues.length === 0, issues };
  }

  // ─── Legacy user-scoped methods (back-compat) ──────────────

  async getCart(userId: string) {
    const cart = await this.cartRepository.findByUser(userId);
    if (!cart) {
      return {
        id: null,
        currency: 'NGN',
        items: [],
        totals: {
          subtotal: formatMoney(0),
          shipping: formatMoney(0),
          discount: formatMoney(0),
          grandTotal: formatMoney(0),
        },
      };
    }
    return this.toDto(cart);
  }

  async addItem(userId: string, productId: string, variantId: string | null, quantity: number) {
    await this.assertProductAvailable(productId);
    const cart = await this.cartRepository.addItem(userId, productId, variantId, quantity);
    return this.toDto(cart);
  }

  private async assertProductAvailable(productId: string): Promise<void> {
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
    if (!product) throw new NotFoundException('Product not found or unavailable');
  }

  async addAvailableReorderItems(
    userId: string,
    requestedItems: Array<{ productId: string; variantId: string | null; quantity: number }>,
  ) {
    const results: Array<{
      productId: string;
      variantId: string | null;
      requestedQuantity: number;
      addedQuantity: number;
      reason?: string;
    }> = [];

    for (const item of requestedItems) {
      const product = await this.prisma.product.findFirst({
        where: {
          id: item.productId,
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
        select: { id: true, inventoryStatus: true, variants: true, isActive: true },
      });
      if (!product) {
        results.push({
          productId: item.productId,
          variantId: item.variantId,
          requestedQuantity: item.quantity,
          addedQuantity: 0,
          reason: 'product_unavailable',
        });
        continue;
      }

      const variant = item.variantId
        ? (product.variants as Array<{ id: string; isInStock: boolean; stockQty: number }>).find(
            (candidate) => candidate.id === item.variantId,
          )
        : null;
      if (item.variantId && !variant) {
        results.push({
          productId: item.productId,
          variantId: item.variantId,
          requestedQuantity: item.quantity,
          addedQuantity: 0,
          reason: 'variant_unavailable',
        });
        continue;
      }

      const availableQuantity = item.variantId
        ? variant?.isInStock
          ? variant.stockQty
          : 0
        : product.inventoryStatus === 'in_stock'
          ? item.quantity
          : 0;
      const quantityToAdd = Math.min(item.quantity, availableQuantity);
      if (quantityToAdd > 0) {
        await this.addItem(userId, item.productId, item.variantId, quantityToAdd);
      }
      results.push({
        productId: item.productId,
        variantId: item.variantId,
        requestedQuantity: item.quantity,
        addedQuantity: quantityToAdd,
        ...(quantityToAdd < item.quantity
          ? { reason: quantityToAdd ? 'quantity_limited' : 'out_of_stock' }
          : {}),
      });
    }

    const cart = await this.getCart(userId);
    const cartId = cart.id ?? (await this.cartRepository.findOrCreateForUser(userId)).publicCartId;
    return {
      cartId,
      items: results,
      unavailableItems: results.filter((item) => item.addedQuantity < item.requestedQuantity),
    };
  }

  async updateItemQuantity(userId: string, itemId: string, quantity: number) {
    const cart = await this.cartRepository.updateItemQuantity(userId, itemId, quantity);
    if (!cart) throw new NotFoundException('Cart item not found');
    return this.toDto(cart);
  }

  async removeItem(userId: string, itemId: string) {
    const cart = await this.cartRepository.removeItem(userId, itemId);
    if (!cart) throw new NotFoundException('Cart item not found');
    return this.toDto(cart);
  }

  // ─── DTO ──────────────────────────────────────────────────

  private toDto(cart: CartRow) {
    const id = cart.publicCartId;

    const items = cart.items.map((item) => {
      const product = item.product as unknown as {
        id: string;
        name: string;
        slug: string;
        thumbnailUrl: string | null;
        price: MoneyDto;
        variants: Array<{ id: string; price: MoneyDto; stockQty: number }>;
      };

      const itemId = item.id;
      const variant = product?.variants?.find((v) => v.id === item.variantId);
      const price = variant?.price ?? product?.price ?? formatMoney(0);
      const lineTotal = formatMoney(price.amount * item.quantity);

      return {
        itemId,
        productId: product?.id ?? '',
        variantId: item.variantId,
        name: product?.name ?? '',
        thumbnailUrl: product?.thumbnailUrl ?? null,
        price,
        quantity: item.quantity,
        stockQty: variant?.stockQty ?? 0,
        lineTotal,
      };
    });

    const subtotalAmount = items.reduce((sum, i) => sum + i.lineTotal.amount, 0);

    return {
      id,
      cartId: id,
      ownerType: cart.ownerType,
      currency: 'NGN',
      items,
      totals: {
        subtotal: formatMoney(subtotalAmount),
        shipping: formatMoney(0),
        discount: formatMoney(0),
        grandTotal: formatMoney(subtotalAmount),
      },
    };
  }
}
