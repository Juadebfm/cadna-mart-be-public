import { BadRequestException, ConflictException } from '@nestjs/common';
import { OrderPaymentStatus } from './schemas/order.schema';
import { OrdersService } from './orders.service';

describe('OrdersService inventory reservation lifecycle', () => {
  const repository = {
    createWithInventoryReservation: jest.fn(),
    markPaid: jest.fn(),
    expireUnpaidOrders: jest.fn(),
    findById: jest.fn(),
    updateBuyerDeliveryAddress: jest.fn(),
    prisma: { deliveryZone: { findMany: jest.fn() } },
  };
  const notifications = { createForUser: jest.fn() };
  const logger = { warn: jest.fn() };
  let service: OrdersService;

  beforeEach(() => {
    jest.clearAllMocks();
    repository.createWithInventoryReservation.mockImplementation(async (value) => ({
      ...value,
      _id: { toString: () => 'order-id' },
      orderRef: value.orderRef,
    }));
    repository.markPaid.mockResolvedValue({
      id: 'order-id',
      orderRef: 'CM-20261102-ABC123',
      userId: 'user-id',
    });
    repository.expireUnpaidOrders.mockResolvedValue([]);
    repository.findById.mockReset();
    repository.updateBuyerDeliveryAddress.mockReset();
    repository.prisma.deliveryZone.findMany.mockReset();
    service = new OrdersService(
      repository as any,
      {} as any,
      {} as any,
      notifications as any,
      logger as any,
      { bookPaidOrder: jest.fn().mockResolvedValue(undefined) } as any,
    );
  });

  it('records a 30-minute expiry when placing an unpaid order', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-02T12:00:00.000Z'));
    try {
      const order = await service.create({
        userId: null,
        guestEmail: 'buyer@example.com',
        guestPhone: '+2348000000000',
        items: [
          {
            productId: 'product-id',
            variantId: null,
            name: 'Product',
            sku: 'SKU',
            thumbnailUrl: null,
            unitPrice: { amount: 100, currency: 'NGN', formatted: '₦100' },
            quantity: 1,
            lineTotal: { amount: 100, currency: 'NGN', formatted: '₦100' },
            sellerId: 'seller-id',
            deliveryMethod: 'seller_owned_courier',
            shippingWeightGrams: 100,
          },
        ],
        deliveryAddress: {
          recipientName: 'Buyer',
          phoneNumber: '+2348000000000',
          street1: '1 Road',
          street2: null,
          city: 'Lagos',
          state: 'Lagos',
          country: 'Nigeria',
          postalCode: null,
        },
        deliveryMode: 'standard' as any,
        pickupDetails: null,
        pricing: {
          subtotal: { amount: 100, currency: 'NGN', formatted: '₦100' },
          deliveryFee: { amount: 0, currency: 'NGN', formatted: '₦0' },
          tax: { amount: 0, currency: 'NGN', formatted: '₦0' },
          total: { amount: 100, currency: 'NGN', formatted: '₦100' },
          currency: 'NGN',
        },
        paymentMethod: null,
        cartRef: null,
      });

      expect(repository.createWithInventoryReservation).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: new Date('2026-11-02T12:30:00.000Z'),
        }),
      );
      expect(order.orderRef).toBeDefined();
    } finally {
      jest.useRealTimers();
    }
  });

  it('marks the inventory hold consumed with a successful payment', async () => {
    await service.updatePaymentStatus('order-id', OrderPaymentStatus.PAID, 'paystack-reference');
    expect(repository.markPaid).toHaveBeenCalledWith('order-id', 'paystack-reference');
  });

  it('does not silently confirm payment for an expired or cancelled order', async () => {
    repository.markPaid.mockResolvedValueOnce(null);
    await expect(
      service.updatePaymentStatus('order-id', OrderPaymentStatus.PAID, 'late-reference'),
    ).rejects.toThrow(ConflictException);
  });

  it('notifies the buyer and logs an admin-review warning for a late successful payment', async () => {
    repository.markPaid.mockResolvedValueOnce({
      id: 'order-id',
      orderRef: 'CM-20261102-ABC123',
      userId: 'user-id',
      paymentStatus: OrderPaymentStatus.REVIEW_REQUIRED,
    });

    await service.updatePaymentStatus('order-id', OrderPaymentStatus.PAID, 'late-reference');

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('admin review is required'),
      'OrdersService',
    );
    expect(notifications.createForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-id',
        title: 'Payment needs review',
      }),
    );
  });

  it('alerts a signed-in buyer when an order expires', async () => {
    repository.expireUnpaidOrders.mockResolvedValueOnce([
      { id: 'order-id', orderRef: 'CM-20261102-ABC123', userId: 'user-id' },
    ]);

    await expect(service.expireUnpaidOrders()).resolves.toBe(1);
    expect(notifications.createForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-id',
        title: 'Order expired',
      }),
    );
  });

  it('reprices an unpaid order when the buyer changes delivery zone', async () => {
    const order = {
      _id: { toString: () => 'order-id' },
      orderRef: 'CM-20261102-ABC123',
      userId: 'user-id',
      deliveryMode: 'multiple',
      status: 'pending_payment',
      paymentStatus: OrderPaymentStatus.UNPAID,
      pricing: {
        subtotal: { amount: 100, currency: 'NGN', formatted: '₦100' },
        deliveryFee: { amount: 1000, currency: 'NGN', formatted: '₦1,000' },
        tax: { amount: 7.5, currency: 'NGN', formatted: '₦8' },
        total: { amount: 1107.5, currency: 'NGN', formatted: '₦1,108' },
        deliveryBreakdown: [
          {
            sellerId: 'seller-id',
            method: 'seller_owned_courier',
            weightGrams: 500,
            items: [{ productId: 'product-id', name: 'Product', quantity: 1 }],
            fee: { amount: 1000, currency: 'NGN', formatted: '₦1,000' },
            status: 'priced',
            rateId: 'old-rate',
          },
        ],
      },
    };
    repository.findById.mockResolvedValue(order);
    repository.prisma.deliveryZone.findMany.mockResolvedValue([
      {
        lgaNames: ['Ikeja'],
        rates: [{ id: 'new-rate', minWeightGrams: 0, maxWeightGrams: 1000, amountKobo: 250000 }],
      },
    ]);
    repository.updateBuyerDeliveryAddress.mockImplementation(
      async (_userId, _orderId, _address, pricing) => ({
        ...order,
        pricing,
      }),
    );

    await service.updateDeliveryAddress('order-id', 'user-id', {
      recipientName: 'Buyer',
      phoneNumber: '+2348000000000',
      street1: '1 Road',
      city: 'Ikeja',
      lga: 'Ikeja',
      state: 'Lagos',
    });

    expect(repository.updateBuyerDeliveryAddress).toHaveBeenCalledWith(
      'user-id',
      'order-id',
      expect.objectContaining({ lga: 'Ikeja' }),
      expect.objectContaining({
        deliveryFee: expect.objectContaining({ amount: 2500 }),
        total: expect.objectContaining({ amount: 2607.5 }),
      }),
    );
  });

  it('does not allow a delivery address change after payment has started', async () => {
    repository.findById.mockResolvedValue({
      _id: { toString: () => 'order-id' },
      userId: 'user-id',
      status: 'pending_payment',
      paymentStatus: OrderPaymentStatus.AWAITING_VERIFICATION,
    });

    await expect(
      service.updateDeliveryAddress('order-id', 'user-id', {
        recipientName: 'Buyer',
        phoneNumber: '+2348000000000',
        street1: '1 Road',
        city: 'Ikeja',
        lga: 'Ikeja',
        state: 'Lagos',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(repository.updateBuyerDeliveryAddress).not.toHaveBeenCalled();
  });
});
