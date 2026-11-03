import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  DeliveryAddressSnapshot,
  DeliveryChargeSnapshot,
  DeliveryMode,
  MoneySnapshot,
  Order,
  OrderItemSnapshot,
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderPricing,
  OrderStatus,
  OrderTimelineEntry,
  OrderTrackingEvent,
  PickupDetailsSnapshot,
} from './schemas/order.schema';
import { OrdersRepository } from './orders.repository';
import { OrderQueryDto } from './dto/order-query.dto';
import { UpdateOrderDeliveryAddressDto } from './dto/update-order-delivery-address.dto';
import { buildOrdersPdf } from './orders-pdf.util';
import { UsersService } from '@users/users.service';
import { CartService } from '@cart/cart.service';
import { NotificationsService } from '@notifications/notifications.service';
import { NotificationCategory } from '@notifications/schemas/notification.schema';
import { LoggerService } from '@logger/logger.service';
import { LogisticsService } from '@logistics/logistics.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly usersService: UsersService,
    private readonly cartService: CartService,
    private readonly notificationsService: NotificationsService,
    private readonly logger: LoggerService,
    private readonly logisticsService: LogisticsService,
  ) {}

  private formatMoney(amount: number): MoneySnapshot {
    return {
      amount,
      currency: 'NGN',
      formatted: '₦' + Math.round(amount).toLocaleString('en-NG'),
    };
  }

  private generateOrderRef(): string {
    const now = new Date();
    const yyyy = now.getFullYear().toString();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hex = randomBytes(3).toString('hex').toUpperCase();
    return `CM-${yyyy}${mm}${dd}-${hex}`;
  }

  private toDto(order: Order): object {
    const id = (order as unknown as { _id: { toString(): string } })._id.toString();
    return {
      id,
      orderRef: order.orderRef,
      userId: order.userId,
      guestEmail: order.guestEmail,
      guestPhone: order.guestPhone,
      items: order.items,
      deliveryAddress: order.deliveryAddress,
      deliveryMode: order.deliveryMode,
      pickupDetails: order.pickupDetails,
      pricing: order.pricing,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      paystackReference: order.paystackReference,
      paidAt: (order as any).paidAt ?? null,
      timeline: order.timeline,
      tracking: order.tracking,
      cancelReason: order.cancelReason,
      cancelledAt: order.cancelledAt,
      expiresAt: (order as any).expiresAt ?? null,
      cartRef: order.cartRef,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  async create(data: {
    userId: string | null;
    guestEmail: string | null;
    guestPhone: string | null;
    items: OrderItemSnapshot[];
    deliveryAddress: DeliveryAddressSnapshot;
    deliveryMode: DeliveryMode;
    pickupDetails: PickupDetailsSnapshot | null;
    pricing: OrderPricing;
    paymentMethod: OrderPaymentMethod | null;
    cartRef: string | null;
  }): Promise<Order> {
    const orderRef = this.generateOrderRef();
    const now = new Date();
    const initialEntry: OrderTimelineEntry = {
      status: OrderStatus.PENDING_PAYMENT,
      timestamp: now,
      note: 'Order placed',
    };

    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
    const order = await this.ordersRepository.createWithInventoryReservation({
      orderRef,
      userId: data.userId ? (data.userId as unknown as Order['userId']) : null,
      guestEmail: data.guestEmail,
      guestPhone: data.guestPhone,
      items: data.items,
      deliveryAddress: data.deliveryAddress,
      deliveryMode: data.deliveryMode,
      pickupDetails: data.pickupDetails,
      pricing: data.pricing,
      paymentMethod: data.paymentMethod,
      cartRef: data.cartRef,
      expiresAt,
      timeline: [initialEntry],
    } as unknown as Partial<Order>);

    if (data.userId) {
      await this.notifyOrderUpdate(data.userId, 'Order placed', `Order ${orderRef} was placed.`);
    }

    return order;
  }

  async findByUser(
    userId: string,
    query: OrderQueryDto,
  ): Promise<{ items: object[]; pagination: object }> {
    const { items, totalItems } = await this.ordersRepository.findByUserId(userId, query);

    const totalPages = Math.ceil(totalItems / query.limit);

    return {
      items: items.map((o) => this.toDto(o)),
      pagination: {
        page: query.page,
        limit: query.limit,
        totalItems,
        totalPages,
      },
    };
  }

  async findAllForBuyer(userId: string, query: OrderQueryDto): Promise<Order[]> {
    return this.ordersRepository.findAllByUserId(userId, query);
  }

  async exportBuyerOrdersPdf(userId: string, query: OrderQueryDto): Promise<Buffer> {
    const orders = await this.findAllForBuyer(userId, query);
    return buildOrdersPdf(orders);
  }

  async reorderForBuyer(orderId: string, userId: string): Promise<object> {
    const order = await this.ordersRepository.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId?.toString() !== userId) throw new ForbiddenException('Access denied');

    return this.cartService.addAvailableReorderItems(
      userId,
      order.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
      })),
    );
  }

  private normalizeLocation(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
  }

  private async repriceUnpaidOrderDelivery(
    order: Order,
    address: DeliveryAddressSnapshot,
  ): Promise<OrderPricing> {
    const existingBreakdown = order.pricing.deliveryBreakdown;
    if (!existingBreakdown?.length) {
      throw new BadRequestException('This order has no delivery breakdown to recalculate');
    }
    const breakdown: DeliveryChargeSnapshot[] = [];
    for (const delivery of existingBreakdown) {
      if (delivery.method !== 'seller_owned_courier') {
        throw new BadRequestException(
          'This courier cannot be repriced until its live quote is available',
        );
      }
      const zones = await this.ordersRepository.prisma.deliveryZone.findMany({
        where: {
          isActive: true,
          state: { equals: address.state, mode: 'insensitive' },
          rates: { some: { isActive: true, method: delivery.method } },
        },
        include: {
          rates: {
            where: { isActive: true, method: delivery.method },
            orderBy: { minWeightGrams: 'asc' },
          },
        },
      });
      const zone = zones.find((candidate: any) =>
        candidate.lgaNames.some(
          (candidateLga: string) =>
            this.normalizeLocation(candidateLga) === this.normalizeLocation(address.lga ?? ''),
        ),
      );
      const rate = zone?.rates.find(
        (candidate: any) =>
          delivery.weightGrams >= candidate.minWeightGrams &&
          (candidate.maxWeightGrams === null || delivery.weightGrams <= candidate.maxWeightGrams),
      );
      if (!rate) {
        throw new BadRequestException('No delivery rate is available for the updated address');
      }
      breakdown.push({
        ...delivery,
        fee: this.formatMoney(rate.amountKobo / 100),
        status: 'priced',
        rateId: rate.id,
        reason: undefined,
      });
    }
    const deliveryFee = breakdown.reduce((sum, delivery) => sum + (delivery.fee?.amount ?? 0), 0);
    const total = order.pricing.subtotal.amount + deliveryFee + order.pricing.tax.amount;
    return {
      ...order.pricing,
      deliveryFee: this.formatMoney(deliveryFee),
      deliveryBreakdown: breakdown,
      total: this.formatMoney(total),
    };
  }

  async updateDeliveryAddress(
    orderId: string,
    userId: string,
    dto: UpdateOrderDeliveryAddressDto,
  ): Promise<object> {
    const deliveryAddress: DeliveryAddressSnapshot = {
      recipientName: dto.recipientName.trim(),
      phoneNumber: dto.phoneNumber.trim(),
      street1: dto.street1.trim(),
      street2: dto.street2?.trim() || null,
      notes: dto.notes?.trim() || null,
      city: dto.city.trim(),
      lga: dto.lga?.trim() || null,
      state: dto.state.trim(),
      country: dto.country?.trim() || 'Nigeria',
      postalCode: dto.postalCode?.trim() || null,
    };
    const order = await this.ordersRepository.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId?.toString() !== userId) throw new ForbiddenException('Access denied');
    if (
      order.status !== OrderStatus.PENDING_PAYMENT ||
      order.paymentStatus !== OrderPaymentStatus.UNPAID
    ) {
      throw new BadRequestException('Address changes are allowed only before payment starts');
    }
    const pricing = await this.repriceUnpaidOrderDelivery(order, deliveryAddress);
    const updated = await this.ordersRepository.updateBuyerDeliveryAddress(
      userId,
      orderId,
      deliveryAddress,
      pricing,
    );
    if (!updated) {
      throw new BadRequestException(
        'Order state changed. Reload the order before changing its address.',
      );
    }
    return this.toDto(updated);
  }

  async findById(orderId: string, userId: string | null): Promise<object> {
    const order = await this.ordersRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (userId !== null) {
      const orderUserId = order.userId ? order.userId.toString() : null;
      if (orderUserId !== userId) {
        throw new ForbiddenException('Access denied');
      }
    }
    return this.toDto(order);
  }

  async findByGuestLookup(orderId: string, guestPhone: string): Promise<object> {
    const order = await this.ordersRepository.findByGuestLookup(orderId, guestPhone);
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return this.toDto(order);
  }

  async cancel(orderId: string, userId: string, reason?: string): Promise<object> {
    const cancelled = await this.ordersRepository.cancelByBuyer(userId, orderId, reason);
    if (cancelled) {
      await this.notifyOrderUpdate(
        userId,
        'Order cancelled',
        `Order ${cancelled.orderRef} was cancelled.`,
      );
      return this.toDto(cancelled);
    }

    const order = await this.ordersRepository.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId?.toString() !== userId) throw new ForbiddenException('Access denied');
    throw new BadRequestException(`Order cannot be cancelled in status: ${order.status}`);
  }

  async findBySeller(
    sellerId: string,
    query: OrderQueryDto,
  ): Promise<{ items: object[]; pagination: object }> {
    const { items, totalItems } = await this.ordersRepository.findBySellerId(
      sellerId,
      query.page,
      query.limit,
    );
    const totalPages = Math.ceil(totalItems / query.limit);
    return {
      items: items.map((o) => this.toDto(o)),
      pagination: { page: query.page, limit: query.limit, totalItems, totalPages },
    };
  }

  async findAllAdmin(
    page: number,
    limit: number,
    status?: string,
    paymentStatus?: string,
  ): Promise<{ items: object[]; pagination: object }> {
    const filters = {
      ...(status ? { status } : {}),
      ...(paymentStatus ? { paymentStatus } : {}),
    };
    const { items, totalItems } = await this.ordersRepository.findAll(page, limit, filters);
    const totalPages = Math.ceil(totalItems / limit);
    return {
      items: items.map((o) => this.toDto(o)),
      pagination: { page, limit, totalItems, totalPages },
    };
  }

  async adminStatusTransition(
    orderId: string,
    status: OrderStatus,
    note: string | undefined,
  ): Promise<object> {
    const order = await this.ordersRepository.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    await this.ordersRepository.updateStatus(orderId, status, note);
    const updated = await this.ordersRepository.findById(orderId);
    if (!updated) throw new NotFoundException('Order not found after update');
    if (updated.userId) {
      await this.notifyOrderUpdate(
        updated.userId.toString(),
        'Order status updated',
        `Order ${updated.orderRef} is now ${status.replace(/_/g, ' ')}.`,
      );
    }
    return this.toDto(updated);
  }

  async updatePaymentStatus(
    orderId: string,
    status: OrderPaymentStatus,
    paystackReference?: string,
  ): Promise<void> {
    if (status === OrderPaymentStatus.PAID) {
      const paid = await this.ordersRepository.markPaid(orderId, paystackReference);
      if (!paid) {
        throw new ConflictException(
          'Order is no longer active. The payment needs review before it can be fulfilled.',
        );
      }
      if (paid.paymentStatus === OrderPaymentStatus.REVIEW_REQUIRED) {
        this.logger.warn(
          `Paystack confirmed payment for inactive order ${paid.orderRef}; admin review is required`,
          'OrdersService',
        );
        if (paid.userId) {
          await this.notifyOrderUpdate(
            paid.userId.toString(),
            'Payment needs review',
            `Payment for order ${paid.orderRef} arrived after the order expired or was cancelled. CADNA will review it; the order has not been fulfilled.`,
            `order-late-payment-review:${orderId}`,
          );
        }
        return;
      }
      if (paid.userId) {
        await this.notifyOrderUpdate(
          paid.userId.toString(),
          'Payment confirmed',
          `Payment for order ${paid.orderRef} was confirmed.`,
        );
      }
      await this.logisticsService.bookPaidOrder(paid);
      return;
    }
    const updateData: Partial<Order> = { paymentStatus: status } as Partial<Order>;
    if (paystackReference) {
      (updateData as Record<string, unknown>)['paystackReference'] = paystackReference;
    }
    await this.ordersRepository.update(orderId, updateData);
  }

  async expireUnpaidOrders(): Promise<number> {
    const expired = await this.ordersRepository.expireUnpaidOrders(new Date());
    for (const order of expired) {
      if (order.userId) {
        await this.notifyOrderUpdate(
          order.userId.toString(),
          'Order expired',
          `Order ${order.orderRef} expired because payment was not completed. Its stock is available again.`,
        );
      }
    }
    return expired.length;
  }

  private async notifyOrderUpdate(
    userId: string,
    title: string,
    body: string,
    idempotencyKey?: string,
  ): Promise<void> {
    try {
      await this.notificationsService.createForUser({
        userId,
        category: NotificationCategory.ORDER_UPDATES,
        title,
        body,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      });
    } catch (error) {
      this.logger.warn(
        `Could not create order notification for user ${userId}: ${(error as Error).message}`,
        'OrdersService',
      );
    }
  }

  async getTimeline(
    orderId: string,
    userId: string | null,
  ): Promise<{ timeline: OrderTimelineEntry[] }> {
    const order = await this.ordersRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (userId !== null) {
      const orderUserId = order.userId ? order.userId.toString() : null;
      if (orderUserId !== userId) {
        throw new ForbiddenException('Access denied');
      }
    }
    return { timeline: order.timeline };
  }

  async getTracking(
    orderId: string,
    userId: string | null,
  ): Promise<{
    orderId: string;
    tracking: OrderTrackingEvent[];
    estimatedDeliveryDays: string | null;
    deliveryAddress: DeliveryAddressSnapshot;
    contactEmail: string | null;
  }> {
    const order = await this.ordersRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (userId !== null) {
      const orderUserId = order.userId ? order.userId.toString() : null;
      if (orderUserId !== userId) {
        throw new ForbiddenException('Access denied');
      }
    }
    const estimatedDeliveryDays =
      order.deliveryMode === DeliveryMode.EXPRESS
        ? '1-2'
        : order.deliveryMode === DeliveryMode.STANDARD
          ? '2-5'
          : null;
    const buyer = userId ? await this.usersService.findById(userId) : null;
    return {
      orderId,
      tracking: order.tracking,
      estimatedDeliveryDays,
      deliveryAddress: order.deliveryAddress,
      contactEmail: buyer?.email ?? order.guestEmail,
    };
  }

  async getInvoice(orderId: string, userId: string | null): Promise<object> {
    const order = await this.ordersRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (userId !== null) {
      const orderUserId = order.userId ? order.userId.toString() : null;
      if (orderUserId !== userId) {
        throw new ForbiddenException('Access denied');
      }
    }
    return {
      orderRef: order.orderRef,
      date: order.createdAt,
      items: order.items,
      pricing: order.pricing,
      deliveryAddress: order.deliveryAddress,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
    };
  }

  async getPod(orderId: string, userId: string | null): Promise<object> {
    const order = await this.ordersRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (userId !== null) {
      const orderUserId = order.userId ? order.userId.toString() : null;
      if (orderUserId !== userId) {
        throw new ForbiddenException('Access denied');
      }
    }
    return {
      orderId,
      orderRef: order.orderRef,
      deliveryMode: order.deliveryMode,
      status: order.status,
      artifacts: [],
    };
  }
}
