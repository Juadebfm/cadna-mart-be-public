import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '@database/prisma.service';
import { createPublicId } from '@database/id.util';
import { CheckoutSession as PrismaCheckoutSession } from '../generated/prisma/client';
import { CheckoutSessionStatus } from './schemas/checkout-session.schema';
import { CreateCheckoutSessionDto } from './dto/checkout-session.dto';
import { SetCheckoutAddressDto } from './dto/set-address.dto';
import { SelectDeliveryDto } from './dto/select-delivery.dto';
import { PickupDetailsDto } from './dto/pickup-details.dto';
import { OrdersService } from '../orders/orders.service';
import { CartRepository } from '@cart/cart.repository';
import { LogisticsService } from '@logistics/logistics.service';
import {
  DeliveryChargeSnapshot,
  DeliveryMode,
  OrderItemSnapshot,
  OrderPricing,
} from '../orders/schemas/order.schema';

@Injectable()
export class CheckoutService {
  private readonly VAT_RATE = 0.075;
  private readonly SESSION_TTL_MINUTES = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly cartRepository: CartRepository,
    private readonly logisticsService: LogisticsService,
  ) {}

  private formatMoney(amount: number): { amount: number; currency: string; formatted: string } {
    return {
      amount,
      currency: 'NGN',
      formatted: '₦' + Math.round(amount).toLocaleString('en-NG'),
    };
  }

  private computePricing(
    subtotal: number,
    deliveryBreakdown: DeliveryChargeSnapshot[],
  ): OrderPricing {
    const deliveryFee = deliveryBreakdown.reduce(
      (sum, delivery) => sum + (delivery.fee?.amount ?? 0),
      0,
    );
    const tax = subtotal * this.VAT_RATE;
    const total = subtotal + deliveryFee + tax;
    return {
      subtotal: this.formatMoney(subtotal),
      deliveryFee: this.formatMoney(deliveryFee),
      deliveryBreakdown,
      tax: this.formatMoney(tax),
      total: this.formatMoney(total),
      currency: 'NGN',
    };
  }

  private getCartSubtotal(cart: any): number {
    let sum = 0;
    for (const item of cart.items) {
      const product = item.product as any;
      const variant = product?.variants?.find((v: any) => v.id === item.variantId);
      const price = variant?.price ?? product?.price;
      const priceAmount = price?.amount ?? price ?? 0;
      sum += priceAmount * item.quantity;
    }
    return sum;
  }

  private async getCheckoutEmail(session: PrismaCheckoutSession): Promise<string> {
    const metadata = (session.metadata as Record<string, unknown> | null) ?? {};
    const guestEmail = metadata['guestEmail'];
    if (typeof guestEmail === 'string' && guestEmail.includes('@')) return guestEmail;
    if (session.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: session.userId },
        select: { email: true },
      });
      if (typeof user?.email === 'string') return user.email;
    }
    return '';
  }

  private selectCourierOptions(
    options: DeliveryChargeSnapshot[],
    selections: Array<{
      groupKey: string;
      quoteId: string;
      courierId: string;
      serviceCode: string;
    }>,
  ): DeliveryChargeSnapshot[] {
    const selected = new Map(selections.map((selection) => [selection.groupKey, selection]));
    return options.map((delivery) => {
      if (!delivery.courierOptions?.length) return delivery;
      const choice = selected.get(delivery.groupKey);
      if (!choice || choice.quoteId !== delivery.quoteId) {
        throw new BadRequestException(`Choose a courier for delivery ${delivery.groupKey}`);
      }
      if (delivery.quoteExpiresAt && new Date(delivery.quoteExpiresAt).getTime() <= Date.now()) {
        throw new BadRequestException('A courier quote has expired. Get delivery options again.');
      }
      const courier = delivery.courierOptions.find(
        (option) =>
          option.courierId === choice.courierId && option.serviceCode === choice.serviceCode,
      );
      if (!courier)
        throw new BadRequestException('The selected courier is not in the current quote');
      return {
        ...delivery,
        fee: this.formatMoney(courier.total),
        courierId: courier.courierId,
        courierName: courier.courierName,
        serviceCode: courier.serviceCode,
      };
    });
  }

  private getSavedDeliveryOptions(session: PrismaCheckoutSession): DeliveryChargeSnapshot[] {
    const metadata = (session.metadata as Record<string, unknown> | null) ?? {};
    const saved = metadata['deliveryOptions'];
    if (!Array.isArray(saved))
      throw new BadRequestException('Get delivery options before choosing a courier');
    return saved as DeliveryChargeSnapshot[];
  }

  private cartDeliveryFingerprint(cart: any): string {
    const lines = (cart.items ?? [])
      .map((item: any) => {
        const product = item.product as any;
        const variant = product?.variants?.find(
          (candidate: any) => candidate.id === item.variantId,
        );
        return {
          productId: String(item.productId ?? product?.id ?? ''),
          variantId: item.variantId ?? null,
          quantity: Number(item.quantity),
          sellerId: String(product?.sellerId ?? ''),
          deliveryMethod: product?.deliveryMethod ?? null,
          logisticsCategoryId: product?.logisticsCategoryId ?? null,
          shippingWeightGrams: product?.shippingWeightGrams ?? null,
          packageLengthCm: product?.packageLengthCm ?? null,
          packageWidthCm: product?.packageWidthCm ?? null,
          packageHeightCm: product?.packageHeightCm ?? null,
          unitPrice: variant?.price?.amount ?? product?.price?.amount ?? null,
        };
      })
      .sort((a: any, b: any) =>
        `${a.productId}:${a.variantId}`.localeCompare(`${b.productId}:${b.variantId}`),
      );
    return JSON.stringify(lines);
  }

  private assertDeliveryOptionsCurrent(session: PrismaCheckoutSession, cart: any): void {
    const metadata = (session.metadata as Record<string, unknown> | null) ?? {};
    if (metadata['deliveryCartFingerprint'] !== this.cartDeliveryFingerprint(cart)) {
      throw new BadRequestException(
        'Your cart changed. Get delivery options again before continuing.',
      );
    }
  }

  private normalizeLocation(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
  }

  private async resolveDeliveryBreakdown(
    cart: any,
    address: Record<string, unknown>,
    buyerEmail: string,
  ): Promise<DeliveryChargeSnapshot[]> {
    type DeliveryGroup = {
      sellerId: string;
      method: string;
      logisticsCategoryId: number | null;
      weightGrams: number | null;
      dimensions: { lengthCm: number; widthCm: number; heightCm: number } | null;
      hasInvalidDimensions: boolean;
      items: Array<{
        productId: string;
        name: string;
        quantity: number;
        weightKg: number | null;
        value: number;
      }>;
    };
    const groups = new Map<string, DeliveryGroup>();

    for (const item of cart.items ?? []) {
      const product = item.product as any;
      const sellerId = product?.sellerId;
      const method = product?.deliveryMethod;
      if (!sellerId || typeof method !== 'string') {
        throw new BadRequestException('Every product must have a seller and delivery method');
      }
      const usesStackApi = method === 'cadna_logistics' || method === 'partner_courier';
      const logisticsCategoryId = Number.isSafeInteger(product.logisticsCategoryId)
        ? Number(product.logisticsCategoryId)
        : null;
      const key = `${sellerId}:${method}${usesStackApi ? `:${logisticsCategoryId ?? 'missing-category'}` : ''}`;
      const group: DeliveryGroup = groups.get(key) ?? {
        sellerId,
        method,
        logisticsCategoryId,
        weightGrams: 0,
        dimensions: null,
        hasInvalidDimensions: false,
        items: [],
      };
      const weight = Number.isSafeInteger(product.shippingWeightGrams)
        ? Number(product.shippingWeightGrams)
        : null;
      if (weight === null || weight < 1 || group.weightGrams === null) {
        group.weightGrams = null;
      } else {
        group.weightGrams += weight * item.quantity;
      }
      const productDimensions = [
        product.packageLengthCm,
        product.packageWidthCm,
        product.packageHeightCm,
      ];
      if (
        productDimensions.every(
          (dimension) =>
            typeof dimension === 'number' && Number.isFinite(dimension) && dimension > 0,
        )
      ) {
        group.dimensions = group.dimensions
          ? {
              lengthCm: Math.max(group.dimensions.lengthCm, product.packageLengthCm),
              widthCm: Math.max(group.dimensions.widthCm, product.packageWidthCm),
              heightCm: Math.max(group.dimensions.heightCm, product.packageHeightCm),
            }
          : {
              lengthCm: product.packageLengthCm,
              widthCm: product.packageWidthCm,
              heightCm: product.packageHeightCm,
            };
      } else {
        group.hasInvalidDimensions = true;
        group.dimensions = null;
      }
      const variant = product?.variants?.find((candidate: any) => candidate.id === item.variantId);
      const unitPrice = Number(variant?.price?.amount ?? product?.price?.amount ?? 0);
      group.items.push({
        productId: String(product.id),
        name: String(product.name ?? ''),
        quantity: Number(item.quantity),
        weightKg: weight === null ? null : weight / 1000,
        value: unitPrice,
      });
      groups.set(key, group);
    }

    const state = typeof address['state'] === 'string' ? address['state'] : '';
    const lga = typeof address['lga'] === 'string' ? address['lga'] : '';
    if (!state.trim() || !lga.trim()) {
      throw new BadRequestException('Enter the delivery state and LGA to calculate delivery');
    }

    const breakdown: DeliveryChargeSnapshot[] = [];
    for (const [groupKey, group] of groups) {
      const snapshotItems = group.items.map(
        ({ weightKg: _weightKg, value: _value, ...item }) => item,
      );
      if (group.method === 'cadna_logistics' || group.method === 'partner_courier') {
        if (
          group.weightGrams === null ||
          !group.logisticsCategoryId ||
          !group.dimensions ||
          group.hasInvalidDimensions ||
          group.items.some((item) => item.weightKg === null)
        ) {
          breakdown.push({
            groupKey,
            sellerId: group.sellerId,
            method: group.method,
            logisticsCategoryId: group.logisticsCategoryId,
            weightGrams: group.weightGrams ?? 0,
            items: snapshotItems,
            fee: null,
            status: 'unavailable',
            reason: 'missing_parcel_details',
          });
          continue;
        }
        const seller = await this.prisma.seller.findFirst({
          where: { id: group.sellerId, deletedAt: null, pickupAddressConfirmedAt: { not: null } },
          include: { owner: { select: { email: true } } },
        });
        const pickup = seller?.pickupAddress as Record<string, unknown> | null;
        if (!seller || !pickup || typeof seller.owner.email !== 'string') {
          breakdown.push({
            groupKey,
            sellerId: group.sellerId,
            method: group.method,
            logisticsCategoryId: group.logisticsCategoryId,
            weightGrams: group.weightGrams,
            items: snapshotItems,
            fee: null,
            status: 'unavailable',
            reason: 'missing_parcel_details',
          });
          continue;
        }
        try {
          const providerResult: any = await this.logisticsService.getQuote({
            sender: {
              name: String(pickup.recipientName ?? ''),
              email: seller.owner.email,
              phone: String(pickup.phoneNumber ?? ''),
              address: [pickup.street1, pickup.street2].filter(Boolean).join(', '),
              city: String(pickup.city ?? ''),
              state: String(pickup.state ?? ''),
            },
            receiver: {
              name: String(address['recipientName'] ?? ''),
              email: buyerEmail,
              phone: String(address['phoneNumber'] ?? ''),
              address: [address['street1'], address['street2']].filter(Boolean).join(', '),
              city: String(address['lga'] ?? address['city'] ?? ''),
              state,
            },
            categoryId: group.logisticsCategoryId,
            items: group.items.map((item) => ({
              name: item.name,
              weight_kg: item.weightKg,
              value: item.value,
              quantity: item.quantity,
            })),
            lengthCm: group.dimensions.lengthCm,
            widthCm: group.dimensions.widthCm,
            heightCm: group.dimensions.heightCm,
          } as any);
          const quote = providerResult?.data ?? providerResult;
          const couriers = Array.isArray(quote?.couriers) ? quote.couriers : [];
          const courierOptions = couriers.flatMap((courier: any) => {
            const amount = Number(courier.amount);
            const fee = Number(courier.fee);
            const total = Number(courier.total);
            if (
              !courier.courier_id ||
              typeof courier.service_code !== 'string' ||
              !Number.isFinite(total)
            )
              return [];
            return [
              {
                courierId: String(courier.courier_id),
                courierName: String(courier.courier_name ?? ''),
                serviceCode: courier.service_code,
                amount: Number.isFinite(amount) ? amount : 0,
                fee: Number.isFinite(fee) ? fee : 0,
                total,
              },
            ];
          });
          const quoteId = typeof quote?.id === 'string' ? quote.id : null;
          const quoteExpiresAt = typeof quote?.expires_at === 'string' ? quote.expires_at : null;
          const quoteExpiryMillis = quoteExpiresAt ? Date.parse(quoteExpiresAt) : Number.NaN;
          const quoteStillValid =
            Number.isFinite(quoteExpiryMillis) && quoteExpiryMillis > Date.now();
          breakdown.push({
            groupKey,
            sellerId: group.sellerId,
            method: group.method,
            logisticsCategoryId: group.logisticsCategoryId,
            weightGrams: group.weightGrams,
            items: snapshotItems,
            fee: null,
            status: quoteId && quoteStillValid && courierOptions.length ? 'priced' : 'unavailable',
            ...(quoteId ? { quoteId } : {}),
            ...(quoteExpiresAt ? { quoteExpiresAt } : {}),
            courierOptions,
            ...(!quoteId || !quoteStillValid || !courierOptions.length
              ? { reason: 'live_quote_unavailable' as const }
              : {}),
          });
        } catch {
          breakdown.push({
            groupKey,
            sellerId: group.sellerId,
            method: group.method,
            logisticsCategoryId: group.logisticsCategoryId,
            weightGrams: group.weightGrams,
            items: snapshotItems,
            fee: null,
            status: 'unavailable',
            reason: 'live_quote_unavailable',
          });
        }
        continue;
      }
      if (group.weightGrams === null) {
        breakdown.push({
          groupKey,
          sellerId: group.sellerId,
          method: group.method,
          weightGrams: 0,
          items: snapshotItems,
          fee: null,
          status: 'unavailable',
          reason: 'missing_weight',
        });
        continue;
      }

      const zones = await this.prisma.deliveryZone.findMany({
        where: {
          isActive: true,
          state: { equals: state.trim(), mode: 'insensitive' },
          rates: { some: { isActive: true, method: group.method } },
        },
        include: {
          rates: {
            where: { isActive: true, method: group.method },
            orderBy: { minWeightGrams: 'asc' },
          },
        },
      });
      const zone = zones.find((candidate: any) =>
        candidate.lgaNames.some(
          (zoneLga: string) => this.normalizeLocation(zoneLga) === this.normalizeLocation(lga),
        ),
      );
      const rate = zone?.rates.find(
        (candidate: any) =>
          group.weightGrams! >= candidate.minWeightGrams &&
          (candidate.maxWeightGrams === null || group.weightGrams! <= candidate.maxWeightGrams),
      );
      if (!rate) {
        breakdown.push({
          groupKey,
          sellerId: group.sellerId,
          method: group.method,
          weightGrams: group.weightGrams,
          items: snapshotItems,
          fee: null,
          status: 'unavailable',
          reason: 'no_matching_rate',
        });
        continue;
      }
      breakdown.push({
        groupKey,
        sellerId: group.sellerId,
        method: group.method,
        weightGrams: group.weightGrams,
        items: snapshotItems,
        fee: this.formatMoney(rate.amountKobo / 100),
        status: 'priced',
        rateId: rate.id,
      });
    }
    return breakdown;
  }

  private assertDeliveryAvailable(breakdown: DeliveryChargeSnapshot[]): void {
    const unavailable = breakdown.filter((delivery) => delivery.status !== 'priced');
    if (unavailable.length) {
      throw new BadRequestException({
        message: 'One or more seller deliveries are not available for this address yet',
        unavailableDeliveries: unavailable,
      });
    }
  }

  private async assertCartProductsAvailable(cart: any): Promise<void> {
    const productIds = Array.from(
      new Set<string>(
        (cart.items ?? [])
          .map((item: any) => item.productId)
          .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0),
      ),
    );
    if (productIds.length === 0) throw new BadRequestException('Cart is empty');
    const available = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
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
    if (available.length !== productIds.length) {
      throw new BadRequestException('One or more products are no longer available');
    }
  }

  private assertSessionActive(
    session: PrismaCheckoutSession | null,
  ): asserts session is PrismaCheckoutSession {
    if (!session) {
      throw new NotFoundException('Checkout session not found');
    }
    if (session.status === CheckoutSessionStatus.EXPIRED) {
      throw new BadRequestException('Checkout session has expired');
    }
    if (session.status === CheckoutSessionStatus.CONFIRMED) {
      throw new BadRequestException('Checkout session is already confirmed');
    }
  }

  async createSession(
    dto: CreateCheckoutSessionDto,
    userId: string | null,
  ): Promise<{ sessionId: string; status: string; expiresAt: Date }> {
    const cart = await this.cartRepository.findByPublicId(dto.cartId);
    if (!cart) {
      throw new NotFoundException('Cart not found');
    }
    if (cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + this.SESSION_TTL_MINUTES * 60 * 1000);

    const metadata: Record<string, unknown> = {};
    if (dto.guestEmail) metadata['guestEmail'] = dto.guestEmail;
    if (dto.guestPhone) metadata['guestPhone'] = dto.guestPhone;

    await this.prisma.checkoutSession.create({
      data: {
        id: createPublicId(),
        sessionId,
        cartId: dto.cartId,
        userId: userId ?? null,
        status: CheckoutSessionStatus.INITIATED,
        expiresAt,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });

    return { sessionId, status: 'initiated', expiresAt };
  }

  async getSession(sessionId: string): Promise<object> {
    const session = await this.prisma.checkoutSession.findFirst({
      where: { sessionId, deletedAt: null },
    });
    if (!session) {
      throw new NotFoundException('Checkout session not found');
    }
    return {
      sessionId: session.sessionId,
      cartId: session.cartId,
      status: session.status,
      deliveryAddress: session.deliveryAddress,
      deliveryMode: session.deliveryMode,
      pricingSnapshot: session.pricingSnapshot,
      pricingLocked: session.pricingLocked,
      expiresAt: session.expiresAt,
    };
  }

  async setAddress(sessionId: string, dto: SetCheckoutAddressDto): Promise<object> {
    const session = await this.prisma.checkoutSession.findFirst({
      where: { sessionId, deletedAt: null },
    });
    this.assertSessionActive(session);

    const updated = await this.prisma.checkoutSession.update({
      where: { sessionId },
      data: {
        deliveryAddress: dto as unknown as Prisma.InputJsonValue,
        addressValidated: false,
        pricingSnapshot: Prisma.DbNull,
        pricingLocked: false,
        status: CheckoutSessionStatus.ADDRESS_SET,
        metadata: {
          ...((session!.metadata as Record<string, unknown> | null) ?? {}),
          deliveryOptions: null,
          deliverySelections: null,
          deliveryCartFingerprint: null,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      sessionId,
      status: 'address_set',
      deliveryAddress: updated?.deliveryAddress ?? dto,
    };
  }

  async validateAddress(sessionId: string): Promise<object> {
    const session = await this.prisma.checkoutSession.findFirst({
      where: { sessionId, deletedAt: null },
    });
    this.assertSessionActive(session);

    if (!session!.deliveryAddress) {
      throw new BadRequestException('Set a delivery address first');
    }

    await this.prisma.checkoutSession.update({
      where: { sessionId },
      data: { addressValidated: true },
    });

    return {
      sessionId,
      validated: true,
      deliveryAddress: session!.deliveryAddress,
    };
  }

  async getDeliveryOptions(sessionId: string): Promise<object> {
    const session = await this.prisma.checkoutSession.findFirst({
      where: { sessionId, deletedAt: null },
    });
    this.assertSessionActive(session);

    if (!session!.deliveryAddress) throw new BadRequestException('Set a delivery address first');
    const cart = await this.cartRepository.findByPublicId(session!.cartId);
    if (!cart) throw new NotFoundException('Cart not found');
    await this.assertCartProductsAvailable(cart);
    const fingerprint = this.cartDeliveryFingerprint(cart);
    const existingMetadata = (session!.metadata as Record<string, unknown> | null) ?? {};
    const existingOptions = existingMetadata['deliveryOptions'];
    const existingFingerprint = existingMetadata['deliveryCartFingerprint'];
    if (existingFingerprint === fingerprint && Array.isArray(existingOptions)) {
      const cached = existingOptions as DeliveryChargeSnapshot[];
      const quotesValid = cached.every(
        (delivery) =>
          delivery.reason !== 'live_quote_unavailable' &&
          (!delivery.quoteExpiresAt || new Date(delivery.quoteExpiresAt).getTime() > Date.now()),
      );
      if (quotesValid) {
        return {
          sessionId,
          canCheckout: cached.every((delivery) => delivery.status === 'priced'),
          deliveries: cached,
        };
      }
    }
    const deliveryBreakdown = await this.resolveDeliveryBreakdown(
      cart,
      session!.deliveryAddress as Record<string, unknown>,
      await this.getCheckoutEmail(session!),
    );
    const metadata = (session!.metadata as Record<string, unknown> | null) ?? {};
    await this.prisma.checkoutSession.update({
      where: { sessionId },
      data: {
        metadata: {
          ...metadata,
          deliveryOptions: deliveryBreakdown,
          deliverySelections: null,
          deliveryCartFingerprint: fingerprint,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      sessionId,
      canCheckout: deliveryBreakdown.every((delivery) => delivery.status === 'priced'),
      deliveries: deliveryBreakdown,
    };
  }

  async selectDelivery(sessionId: string, dto: SelectDeliveryDto): Promise<object> {
    const session = await this.prisma.checkoutSession.findFirst({
      where: { sessionId, deletedAt: null },
    });
    this.assertSessionActive(session);

    if (!session!.deliveryAddress) throw new BadRequestException('Set a delivery address first');
    const cart = await this.cartRepository.findByPublicId(session!.cartId);
    if (!cart) throw new NotFoundException('Cart not found');
    await this.assertCartProductsAvailable(cart);
    this.assertDeliveryOptionsCurrent(session!, cart);
    const options = this.getSavedDeliveryOptions(session!);
    const selections = dto.selections ?? [];
    const requiredGroupKeys = options
      .filter((item) => item.courierOptions?.length)
      .map((item) => item.groupKey);
    if (
      requiredGroupKeys.some(
        (groupKey) => !selections.some((selection) => selection.groupKey === groupKey),
      )
    ) {
      throw new BadRequestException('Choose one courier for each delivery before continuing');
    }
    if (
      selections.length !== requiredGroupKeys.length ||
      new Set(selections.map((selection) => selection.groupKey)).size !== selections.length
    ) {
      throw new BadRequestException('Choose exactly one courier for each delivery');
    }
    const deliveryBreakdown = this.selectCourierOptions(options, selections);
    this.assertDeliveryAvailable(deliveryBreakdown);

    const metadata = (session!.metadata as Record<string, unknown> | null) ?? {};

    await this.prisma.checkoutSession.update({
      where: { sessionId },
      data: {
        deliveryMode: DeliveryMode.MULTIPLE,
        status: CheckoutSessionStatus.DELIVERY_SET,
        pricingLocked: false,
        metadata: {
          ...metadata,
          deliverySelections: selections,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      sessionId,
      status: 'delivery_set',
      deliveryMode: DeliveryMode.MULTIPLE,
      deliveries: deliveryBreakdown,
    };
  }

  async setPickupDetails(sessionId: string, dto: PickupDetailsDto): Promise<object> {
    const session = await this.prisma.checkoutSession.findFirst({
      where: { sessionId, deletedAt: null },
    });
    this.assertSessionActive(session);

    if (session!.deliveryMode !== 'pickup') {
      throw new BadRequestException('Pickup details only apply to pickup delivery mode');
    }

    await this.prisma.checkoutSession.update({
      where: { sessionId },
      data: { pickupDetails: dto as unknown as Prisma.InputJsonValue },
    });

    return { sessionId, pickupDetails: dto };
  }

  async getSummary(sessionId: string): Promise<object> {
    const session = await this.prisma.checkoutSession.findFirst({
      where: { sessionId, deletedAt: null },
    });
    this.assertSessionActive(session);

    if (!session!.deliveryAddress) {
      throw new BadRequestException('Set delivery address first');
    }
    if (!session!.deliveryMode) {
      throw new BadRequestException('Select delivery mode first');
    }

    const cart = await this.cartRepository.findByPublicId(session!.cartId);
    if (!cart) {
      throw new NotFoundException('Cart not found');
    }
    await this.assertCartProductsAvailable(cart);
    this.assertDeliveryOptionsCurrent(session!, cart);

    const subtotal = this.getCartSubtotal(cart);
    const metadata = (session!.metadata as Record<string, unknown> | null) ?? {};
    const deliveryBreakdown = this.selectCourierOptions(
      this.getSavedDeliveryOptions(session!),
      (metadata['deliverySelections'] as Array<{
        groupKey: string;
        quoteId: string;
        courierId: string;
        serviceCode: string;
      }>) ?? [],
    );
    this.assertDeliveryAvailable(deliveryBreakdown);
    const pricing = this.computePricing(subtotal, deliveryBreakdown);

    await this.prisma.checkoutSession.update({
      where: { sessionId },
      data: {
        pricingSnapshot: pricing as unknown as Prisma.InputJsonValue,
        pricingLocked: true,
        status: CheckoutSessionStatus.SUMMARY_READY,
      },
    });

    return {
      sessionId,
      status: 'summary_ready',
      pricingLocked: true,
      cart: { itemCount: cart.items.length },
      deliveryAddress: session!.deliveryAddress,
      deliveryMode: session!.deliveryMode,
      deliveries: deliveryBreakdown,
      pricing,
      expiresAt: session!.expiresAt,
    };
  }

  async confirmSession(sessionId: string, userId: string | null): Promise<object> {
    const session = await this.prisma.checkoutSession.findFirst({
      where: { sessionId, deletedAt: null },
    });
    this.assertSessionActive(session);

    if (session!.status !== CheckoutSessionStatus.SUMMARY_READY) {
      throw new BadRequestException('Review the order summary before confirming');
    }

    const cart = await this.cartRepository.findByPublicId(session!.cartId);
    if (!cart) {
      throw new NotFoundException('Cart not found');
    }
    await this.assertCartProductsAvailable(cart);
    this.assertDeliveryOptionsCurrent(session!, cart);

    const metadata = (session!.metadata as Record<string, unknown> | null) ?? {};
    const deliveryBreakdown = this.selectCourierOptions(
      this.getSavedDeliveryOptions(session!),
      (metadata['deliverySelections'] as Array<{
        groupKey: string;
        quoteId: string;
        courierId: string;
        serviceCode: string;
      }>) ?? [],
    );
    this.assertDeliveryAvailable(deliveryBreakdown);
    const freshPricing = this.computePricing(this.getCartSubtotal(cart), deliveryBreakdown);
    const priorPricing = session!.pricingSnapshot as OrderPricing | null;
    if (
      !priorPricing ||
      priorPricing.total.amount !== freshPricing.total.amount ||
      JSON.stringify(priorPricing.deliveryBreakdown ?? []) !==
        JSON.stringify(freshPricing.deliveryBreakdown)
    ) {
      throw new BadRequestException('Checkout pricing changed. Review the order summary again.');
    }

    const items: OrderItemSnapshot[] = cart.items.map((item) => {
      const product = item.product as any;
      const variant = product?.variants?.find((v: any) => v.id === item.variantId);
      const unitPrice = variant?.price ??
        product?.price ?? { amount: 0, currency: 'NGN', formatted: '₦0' };
      const lineTotal = this.formatMoney(unitPrice.amount * item.quantity);
      return {
        productId: product?.id?.toString() ?? '',
        variantId: item.variantId,
        name: product?.name ?? '',
        sku: variant?.sku ?? product?.sku ?? null,
        thumbnailUrl: product?.thumbnailUrl ?? null,
        unitPrice,
        quantity: item.quantity,
        lineTotal,
        sellerId: product?.sellerId?.toString() ?? null,
        deliveryMethod: product?.deliveryMethod ?? '',
        shippingWeightGrams: product?.shippingWeightGrams ?? null,
      };
    });

    const pricing = freshPricing;
    const order = await this.ordersService.create({
      userId: userId ?? null,
      guestEmail: (metadata['guestEmail'] as string) ?? null,
      guestPhone: (metadata['guestPhone'] as string) ?? null,
      items,
      deliveryAddress: session!.deliveryAddress as any,
      deliveryMode: DeliveryMode.MULTIPLE,
      pickupDetails: session!.pickupDetails as any,
      pricing,
      paymentMethod: null,
      cartRef: session!.cartId,
    });

    const orderId = String((order as unknown as { _id: { toString(): string } })._id);

    await this.prisma.checkoutSession.update({
      where: { sessionId },
      data: { status: CheckoutSessionStatus.CONFIRMED, orderId },
    });

    return {
      sessionId,
      status: 'confirmed',
      orderId,
      orderRef: order.orderRef,
      pricing: order.pricing,
    };
  }
}
