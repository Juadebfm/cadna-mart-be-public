import { Injectable } from '@nestjs/common';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { createPublicId } from '@database/id.util';
import { Prisma } from '../generated/prisma/client';
import { Order, OrderPaymentStatus, OrderStatus, OrderTimelineEntry } from './schemas/order.schema';
import { OrderQueryDto } from './dto/order-query.dto';

@Injectable()
export class OrdersRepository {
  constructor(public readonly prisma: PrismaService) {}

  private legacy(row: any): Order | null {
    return row ? ({ ...row, _id: row.id } as unknown as Order) : null;
  }
  private json(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }
  private matchesItems(order: any, search: string) {
    return (
      Array.isArray(order.items) &&
      order.items.some((item: any) =>
        String(item.name ?? '')
          .toLowerCase()
          .includes(search.toLowerCase()),
      )
    );
  }
  private orderWhere(query: OrderQueryDto) {
    return {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
  }

  async create(data: Partial<Order>): Promise<Order> {
    const value = data as any;
    return this.legacy(
      await this.prisma.order.create({
        data: {
          id: createPublicId(),
          orderRef: value.orderRef,
          userId: value.userId ?? null,
          guestEmail: value.guestEmail ?? null,
          guestPhone: value.guestPhone ?? null,
          items: this.json(value.items ?? []),
          deliveryAddress: this.json(value.deliveryAddress),
          deliveryMode: value.deliveryMode ?? 'standard',
          pickupDetails: value.pickupDetails ? this.json(value.pickupDetails) : undefined,
          pricing: this.json(value.pricing),
          status: value.status ?? OrderStatus.PENDING_PAYMENT,
          paymentStatus: value.paymentStatus ?? OrderPaymentStatus.UNPAID,
          paymentMethod: value.paymentMethod ?? null,
          paystackReference: value.paystackReference ?? null,
          timeline: this.json(value.timeline ?? []),
          tracking: this.json(value.tracking ?? []),
          cancelReason: value.cancelReason ?? null,
          cancelledAt: value.cancelledAt ?? null,
          expiresAt: value.expiresAt ?? null,
          cartRef: value.cartRef ?? null,
          deletedAt: value.deletedAt ?? null,
        },
      }),
    )!;
  }

  async createWithInventoryReservation(data: Partial<Order>): Promise<Order> {
    const value = data as any;
    const items = Array.isArray(value.items) ? value.items : [];
    const byStockKey = new Map<
      string,
      { productId: string; variantId: string | null; quantity: number }
    >();
    for (const item of items) {
      if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || !item.productId) {
        throw new ConflictException('Order item quantity or product is invalid');
      }
      const key = `${item.productId}:${item.variantId ?? ''}`;
      const existing = byStockKey.get(key);
      if (existing) existing.quantity += item.quantity;
      else
        byStockKey.set(key, {
          productId: item.productId,
          variantId: item.variantId ?? null,
          quantity: item.quantity,
        });
    }
    const stockItems = [...byStockKey.values()].sort(
      (a, b) =>
        a.productId.localeCompare(b.productId) ||
        (a.variantId ?? '').localeCompare(b.variantId ?? ''),
    );
    const orderId = createPublicId();

    const row = await this.prisma.$transaction(async (tx) => {
      const reservations: Array<Record<string, unknown>> = [];
      for (const item of stockItems) {
        await tx.$queryRaw`SELECT id FROM products WHERE id = ${item.productId} FOR UPDATE`;
        const product = await tx.product.findFirst({
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
        });
        if (!product) throw new ConflictException('One or more products are no longer available');

        const variants = Array.isArray(product.variants) ? ([...product.variants] as any[]) : [];
        if (variants.length) {
          const index = variants.findIndex((variant) => variant.id === item.variantId);
          if (index < 0 || Number(variants[index].stockQty ?? 0) < item.quantity) {
            throw new ConflictException('The requested product quantity is no longer available');
          }
          variants[index] = {
            ...variants[index],
            stockQty: Number(variants[index].stockQty) - item.quantity,
            isInStock: Number(variants[index].stockQty) - item.quantity > 0,
          };
        } else if (item.variantId || product.stockQty < item.quantity) {
          throw new ConflictException('The requested product quantity is no longer available');
        }

        const stockQty = Math.max(0, product.stockQty - item.quantity);
        await tx.product.update({
          where: { id: product.id },
          data: {
            stockQty,
            inventoryStatus: stockQty > 0 ? 'in_stock' : 'out_of_stock',
            ...(variants.length ? { variants: this.json(variants) } : {}),
          },
        });
        reservations.push({
          id: createPublicId(),
          orderId,
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          status: 'held',
          expiresAt: value.expiresAt,
        });
      }

      const order = await tx.order.create({
        data: {
          id: orderId,
          orderRef: value.orderRef,
          userId: value.userId ?? null,
          guestEmail: value.guestEmail ?? null,
          guestPhone: value.guestPhone ?? null,
          items: this.json(items),
          deliveryAddress: this.json(value.deliveryAddress),
          deliveryMode: value.deliveryMode ?? 'standard',
          pickupDetails: value.pickupDetails ? this.json(value.pickupDetails) : undefined,
          pricing: this.json(value.pricing),
          status: OrderStatus.PENDING_PAYMENT,
          paymentStatus: OrderPaymentStatus.UNPAID,
          paymentMethod: value.paymentMethod ?? null,
          timeline: this.json(value.timeline ?? []),
          tracking: this.json(value.tracking ?? []),
          cartRef: value.cartRef ?? null,
          expiresAt: value.expiresAt,
        },
      });
      if (reservations.length)
        await tx.inventoryReservation.createMany({ data: reservations as any });
      return order;
    });
    return this.legacy(row)!;
  }

  async findById(id: string): Promise<Order | null> {
    return this.legacy(await this.prisma.order.findFirst({ where: { id, deletedAt: null } }));
  }
  async findByOrderRef(orderRef: string): Promise<Order | null> {
    return this.legacy(await this.prisma.order.findFirst({ where: { orderRef, deletedAt: null } }));
  }
  async findByPaystackReference(reference: string): Promise<Order | null> {
    return this.legacy(
      await this.prisma.order.findFirst({
        where: { paystackReference: reference, deletedAt: null },
      }),
    );
  }
  async findByGuestLookup(id: string, guestPhone: string): Promise<Order | null> {
    return this.legacy(
      await this.prisma.order.findFirst({ where: { id, guestPhone, deletedAt: null } }),
    );
  }

  async findByUserId(userId: string, query: OrderQueryDto) {
    const where = { ...this.orderWhere(query), userId };
    const search = query.search?.trim().toLowerCase();
    const rows = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...(search ? {} : { skip: (query.page - 1) * query.limit, take: query.limit }),
    });
    const filtered = search
      ? rows.filter(
          (row) => row.orderRef.toLowerCase().includes(search) || this.matchesItems(row, search),
        )
      : rows;
    const totalItems = search ? filtered.length : await this.prisma.order.count({ where });
    const items = search
      ? filtered.slice((query.page - 1) * query.limit, query.page * query.limit)
      : filtered;
    return { items: items.map((row) => this.legacy(row)!), totalItems };
  }

  async findAllByUserId(userId: string, query: OrderQueryDto): Promise<Order[]> {
    const search = query.search?.trim().toLowerCase();
    const rows = await this.prisma.order.findMany({
      where: { ...this.orderWhere(query), userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows
      .filter(
        (row) =>
          !search || row.orderRef.toLowerCase().includes(search) || this.matchesItems(row, search),
      )
      .map((row) => this.legacy(row)!);
  }

  async updateBuyerDeliveryAddress(
    userId: string,
    orderId: string,
    deliveryAddress: Order['deliveryAddress'],
    pricing: Order['pricing'],
  ): Promise<Order | null> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: {
          id: orderId,
          userId,
          deletedAt: null,
          status: OrderStatus.PENDING_PAYMENT,
          paymentStatus: OrderPaymentStatus.UNPAID,
        },
        data: {
          deliveryAddress: this.json(deliveryAddress),
          pricing: this.json(pricing),
        },
      });
      if (!updated.count) return null;
      return this.legacy(await tx.order.findUnique({ where: { id: orderId } }));
    });
  }

  private async releaseHeldReservations(tx: any, orderId: string, releasedAt: Date): Promise<void> {
    const reservations = await tx.inventoryReservation.findMany({
      where: { orderId, status: 'held' },
      orderBy: [{ productId: 'asc' }, { variantId: 'asc' }],
    });
    for (const reservation of reservations) {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${reservation.productId} FOR UPDATE`;
      const product = await tx.product.findUnique({ where: { id: reservation.productId } });
      if (!product)
        throw new ConflictException('Reserved product is unavailable for stock release');
      const variants = Array.isArray(product.variants) ? ([...product.variants] as any[]) : [];
      if (reservation.variantId) {
        const index = variants.findIndex((variant) => variant.id === reservation.variantId);
        if (index < 0) throw new ConflictException('Reserved variant is no longer available');
        const restored = Number(variants[index].stockQty ?? 0) + reservation.quantity;
        variants[index] = { ...variants[index], stockQty: restored, isInStock: restored > 0 };
      }
      const stockQty = product.stockQty + reservation.quantity;
      await tx.product.update({
        where: { id: product.id },
        data: {
          stockQty,
          inventoryStatus: stockQty > 0 ? 'in_stock' : 'out_of_stock',
          ...(variants.length ? { variants: this.json(variants) } : {}),
        },
      });
      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: 'released', releasedAt },
      });
    }
  }

  async cancelByBuyer(userId: string, orderId: string, reason?: string): Promise<Order | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      const current = await tx.order.findFirst({
        where: {
          id: orderId,
          userId,
          deletedAt: null,
          status: OrderStatus.PENDING_PAYMENT,
          paymentStatus: {
            in: [OrderPaymentStatus.UNPAID, OrderPaymentStatus.AWAITING_VERIFICATION],
          },
        },
      });
      if (!current) return null;
      const timestamp = new Date();
      const timeline = [
        ...(Array.isArray(current.timeline) ? (current.timeline as any[]) : []),
        { status: OrderStatus.CANCELLED, timestamp, note: reason ?? 'Cancelled by buyer' },
      ];
      const cancelled = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledAt: timestamp,
          cancelReason: reason ?? null,
          timeline: this.json(timeline),
        },
      });
      await this.releaseHeldReservations(tx, orderId, timestamp);
      return this.legacy(cancelled);
    });
  }

  async expireUnpaidOrders(now = new Date(), limit = 100): Promise<Order[]> {
    const expired: Order[] = [];
    const due = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING_PAYMENT,
        paymentStatus: {
          in: [OrderPaymentStatus.UNPAID, OrderPaymentStatus.AWAITING_VERIFICATION],
        },
        expiresAt: { lte: now },
        deletedAt: null,
      },
      select: { id: true },
      orderBy: { expiresAt: 'asc' },
      take: limit,
    });
    for (const { id } of due) {
      const order = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
        const current = await tx.order.findFirst({
          where: {
            id,
            status: OrderStatus.PENDING_PAYMENT,
            paymentStatus: {
              in: [OrderPaymentStatus.UNPAID, OrderPaymentStatus.AWAITING_VERIFICATION],
            },
            expiresAt: { lte: now },
            deletedAt: null,
          },
        });
        if (!current) return null;
        const timestamp = now;
        const timeline = [
          ...(Array.isArray(current.timeline) ? (current.timeline as any[]) : []),
          {
            status: OrderStatus.CANCELLED,
            timestamp,
            note: 'Unpaid order expired after 30 minutes',
          },
        ];
        const cancelled = await tx.order.update({
          where: { id },
          data: {
            status: OrderStatus.CANCELLED,
            cancelledAt: timestamp,
            cancelReason: 'Unpaid order expired after 30 minutes',
            timeline: this.json(timeline),
          },
        });
        await this.releaseHeldReservations(tx, id, timestamp);
        return cancelled;
      });
      if (order) expired.push(this.legacy(order)!);
    }
    return expired;
  }

  async markPaid(orderId: string, reference?: string): Promise<Order | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      const now = new Date();
      const current = await tx.order.findFirst({
        where: {
          id: orderId,
          deletedAt: null,
          status: OrderStatus.PENDING_PAYMENT,
          paymentStatus: {
            in: [OrderPaymentStatus.UNPAID, OrderPaymentStatus.AWAITING_VERIFICATION],
          },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      });
      if (!current) {
        const inactiveOrder = await tx.order.findFirst({
          where: { id: orderId, deletedAt: null },
        });
        if (!inactiveOrder) return null;
        if (
          inactiveOrder.paymentStatus === OrderPaymentStatus.PAID ||
          inactiveOrder.paymentStatus === OrderPaymentStatus.REFUNDED ||
          inactiveOrder.paymentStatus === OrderPaymentStatus.REVIEW_REQUIRED
        ) {
          return this.legacy(inactiveOrder);
        }
        const reviewTimeline = [
          ...(Array.isArray(inactiveOrder.timeline) ? (inactiveOrder.timeline as any[]) : []),
          {
            status: inactiveOrder.status,
            timestamp: now,
            note: 'Provider confirmed payment after the order became inactive; manual review required',
          },
        ];
        return this.legacy(
          await tx.order.update({
            where: { id: orderId },
            data: {
              paymentStatus: OrderPaymentStatus.REVIEW_REQUIRED,
              ...(reference ? { paystackReference: reference } : {}),
              timeline: this.json(reviewTimeline),
            },
          }),
        );
      }
      const timeline = [
        ...(Array.isArray(current.timeline) ? (current.timeline as any[]) : []),
        { status: OrderStatus.CONFIRMED, timestamp: now, note: 'Payment confirmed' },
      ];
      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CONFIRMED,
          paymentStatus: OrderPaymentStatus.PAID,
          paidAt: now,
          ...(reference ? { paystackReference: reference } : {}),
          timeline: this.json(timeline),
        },
      });
      const unitsByProduct = new Map<string, number>();
      for (const item of Array.isArray(current.items) ? (current.items as any[]) : []) {
        if (item?.productId && Number.isSafeInteger(item.quantity) && item.quantity > 0) {
          unitsByProduct.set(
            item.productId,
            (unitsByProduct.get(item.productId) ?? 0) + item.quantity,
          );
        }
      }
      for (const [productId, quantity] of unitsByProduct) {
        await tx.product.updateMany({
          where: { id: productId },
          data: { salesCount: { increment: quantity } },
        });
      }
      await tx.inventoryReservation.updateMany({
        where: { orderId, status: 'held' },
        data: { status: 'consumed' },
      });
      return this.legacy(updated);
    });
  }

  async updateStatus(id: string, status: OrderStatus, note?: string): Promise<Order | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
      const current = await tx.order.findFirst({ where: { id, deletedAt: null } });
      if (!current) return null;
      const timestamp = new Date();
      const entry: OrderTimelineEntry = { status, timestamp, note: note ?? null };
      const timeline = [
        ...(Array.isArray(current.timeline) ? (current.timeline as any[]) : []),
        entry,
      ];
      const updated = await tx.order.update({
        where: { id },
        data: {
          status,
          timeline: this.json(timeline),
          ...(status === OrderStatus.CANCELLED ? { cancelledAt: timestamp } : {}),
        },
      });
      if (status === OrderStatus.CANCELLED) {
        await this.releaseHeldReservations(tx, id, timestamp);
      }
      return this.legacy(updated);
    });
  }

  async transitionStatusIfCurrent(
    id: string,
    allowedStatuses: OrderStatus[],
    status: OrderStatus,
    note?: string,
  ): Promise<Order | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
      const current = await tx.order.findFirst({
        where: { id, deletedAt: null, status: { in: allowedStatuses } },
      });
      if (!current) return null;
      const entry: OrderTimelineEntry = { status, timestamp: new Date(), note: note ?? null };
      return this.legacy(
        await tx.order.update({
          where: { id },
          data: {
            status,
            timeline: this.json([
              ...(Array.isArray(current.timeline) ? (current.timeline as any[]) : []),
              entry,
            ]),
          },
        }),
      );
    });
  }

  async reserveReturnQuantity(
    orderId: string,
    requestId: string,
    productId: string,
    variantId: string | null,
    quantity: number,
    purchasedQuantity: number,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findFirst({ where: { id: orderId, deletedAt: null } });
      if (!order) return false;
      const reservations = Array.isArray(order.returnQuantityReservations)
        ? (order.returnQuantityReservations as any[])
        : [];
      const reserved = reservations
        .filter((item) => item.productId === productId && (item.variantId ?? null) === variantId)
        .reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
      if (reserved + quantity > purchasedQuantity) return false;
      reservations.push({ requestId, productId, variantId, quantity });
      await tx.order.update({
        where: { id: orderId },
        data: { returnQuantityReservations: this.json(reservations) },
      });
      return true;
    });
  }

  async releaseReturnQuantity(orderId: string, requestId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return;
    const reservations = Array.isArray(order.returnQuantityReservations)
      ? (order.returnQuantityReservations as any[])
      : [];
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        returnQuantityReservations: this.json(
          reservations.filter((item) => item.requestId !== requestId),
        ),
      },
    });
  }

  async update(id: string, data: Partial<Order>): Promise<Order | null> {
    const mapped: any = { ...(data as any) };
    for (const key of [
      'items',
      'deliveryAddress',
      'pickupDetails',
      'pricing',
      'timeline',
      'tracking',
      'returnQuantityReservations',
    ])
      if (key in mapped && mapped[key] !== null) mapped[key] = this.json(mapped[key]);
    try {
      return this.legacy(await this.prisma.order.update({ where: { id }, data: mapped }));
    } catch {
      return null;
    }
  }

  async reserveRefund(orderId: string, requestId: string, amount: number): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findFirst({
        where: {
          id: orderId,
          deletedAt: null,
          paymentStatus: OrderPaymentStatus.PAID,
          refundInProgressRequestId: null,
        },
      });
      if (!order) return false;
      const pricing = order.pricing as any;
      const total = Number(pricing?.total?.amount ?? 0);
      if (order.refundedAmount + order.reservedRefundAmount + amount > total) return false;
      await tx.order.update({
        where: { id: orderId },
        data: { refundInProgressRequestId: requestId, reservedRefundAmount: { increment: amount } },
      });
      return true;
    });
  }

  async finishRefundReservation(
    orderId: string,
    requestId: string,
    amount: number,
    processed: boolean,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      const current = await tx.order.findFirst({
        where: { id: orderId, refundInProgressRequestId: requestId },
      });
      if (!current) return;
      if (processed) {
        const request = await tx.returnRequest.findFirst({
          where: { id: requestId, orderId },
          select: { items: true },
        });
        const unitsByProduct = new Map<string, number>();
        for (const item of Array.isArray(request?.items) ? (request.items as any[]) : []) {
          if (item?.productId && Number.isSafeInteger(item.quantity) && item.quantity > 0) {
            unitsByProduct.set(
              item.productId,
              (unitsByProduct.get(item.productId) ?? 0) + item.quantity,
            );
          }
        }
        for (const [productId, quantity] of unitsByProduct) {
          await tx.$executeRaw`UPDATE products SET "salesCount" = GREATEST("salesCount" - ${quantity}, 0) WHERE id = ${productId}`;
        }
      }
      await tx.order.update({
        where: { id: orderId },
        data: {
          refundInProgressRequestId: null,
          reservedRefundAmount: { decrement: amount },
          ...(processed ? { refundedAmount: { increment: amount } } : {}),
        },
      });
    });
  }

  async findBySellerId(sellerId: string, page: number, limit: number) {
    const rows = await this.prisma.order.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const filtered = rows.filter(
      (order) =>
        Array.isArray(order.items) &&
        (order.items as any[]).some((item) => item.sellerId === sellerId),
    );
    return {
      items: filtered.slice((page - 1) * limit, page * limit).map((row) => this.legacy(row)!),
      totalItems: filtered.length,
    };
  }

  async findAll(page: number, limit: number, filters: Record<string, unknown> = {}) {
    const where = { ...filters, deletedAt: null } as any;
    const [rows, totalItems] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items: rows.map((row) => this.legacy(row)!), totalItems };
  }
}
