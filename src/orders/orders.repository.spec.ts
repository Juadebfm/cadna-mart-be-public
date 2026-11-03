import { ConflictException } from '@nestjs/common';
import { OrderPaymentStatus } from './schemas/order.schema';
import { OrdersRepository } from './orders.repository';

describe('OrdersRepository inventory reservations', () => {
  let product: any;
  let prisma: any;
  let tx: any;
  let repository: OrdersRepository;
  const createOrder = () => ({
    orderRef: 'CM-20261102-ABC123',
    items: [
      {
        productId: 'product-id',
        variantId: 'variant-id',
        name: 'Product',
        sku: 'SKU',
        thumbnailUrl: null,
        unitPrice: { amount: 100, currency: 'NGN', formatted: '₦100' },
        quantity: 1,
        lineTotal: { amount: 100, currency: 'NGN', formatted: '₦100' },
        sellerId: 'seller-id',
      },
    ],
    deliveryAddress: { recipientName: 'Buyer' },
    deliveryMode: 'standard',
    pricing: { total: { amount: 100, currency: 'NGN', formatted: '₦100' } },
    expiresAt: new Date('2026-11-02T12:30:00.000Z'),
  });

  beforeEach(() => {
    product = {
      id: 'product-id',
      stockQty: 2,
      inventoryStatus: 'in_stock',
      variants: [{ id: 'variant-id', stockQty: 2, isInStock: true }],
    };
    tx = {
      $queryRaw: jest.fn(),
      product: {
        findFirst: jest.fn().mockImplementation(async () => product),
        update: jest.fn().mockImplementation(async ({ data }) => {
          product = { ...product, ...data };
          return product;
        }),
        updateMany: jest.fn(),
      },
      order: {
        create: jest.fn().mockImplementation(async ({ data }) => data),
        findFirst: jest.fn(),
        update: jest.fn().mockImplementation(async ({ data }) => data),
      },
      inventoryReservation: { createMany: jest.fn(), updateMany: jest.fn() },
    };
    prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    repository = new OrdersRepository(prisma as any);
  });

  it('decrements variant and total stock and creates a 30-minute hold atomically', async () => {
    const order = await repository.createWithInventoryReservation(createOrder() as any);

    expect(product.stockQty).toBe(1);
    expect(product.inventoryStatus).toBe('in_stock');
    expect(product.variants[0]).toMatchObject({ stockQty: 1, isInStock: true });
    expect(tx.inventoryReservation.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          orderId: order._id.toString(),
          productId: 'product-id',
          variantId: 'variant-id',
          quantity: 1,
          status: 'held',
          expiresAt: new Date('2026-11-02T12:30:00.000Z'),
        }),
      ],
    });
  });

  it('rejects an order when the requested variant stock is no longer available', async () => {
    product.variants[0].stockQty = 0;
    product.stockQty = 0;
    await expect(repository.createWithInventoryReservation(createOrder() as any)).rejects.toThrow(
      ConflictException,
    );
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('accepts a successful payment after initialization changed the status to awaiting verification', async () => {
    tx.order.findFirst.mockResolvedValue({
      id: 'order-id',
      status: 'pending_payment',
      paymentStatus: OrderPaymentStatus.AWAITING_VERIFICATION,
      timeline: [],
      items: [{ productId: 'product-id', quantity: 2 }],
    });

    const paid = await repository.markPaid('order-id', 'paystack-ref');

    expect(tx.order.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        paymentStatus: {
          in: [OrderPaymentStatus.UNPAID, OrderPaymentStatus.AWAITING_VERIFICATION],
        },
      }),
    });
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paymentStatus: OrderPaymentStatus.PAID }),
      }),
    );
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'product-id' },
      data: { salesCount: { increment: 2 } },
    });
    expect(paid).toBeDefined();
  });

  it('marks a provider-confirmed late payment for manual review without fulfilling the order', async () => {
    tx.order.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'order-id',
      orderRef: 'CM-20261102-ABC123',
      status: 'cancelled',
      paymentStatus: OrderPaymentStatus.AWAITING_VERIFICATION,
      timeline: [],
    });

    const result = await repository.markPaid('order-id', 'late-paystack-ref');

    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-id' },
        data: expect.objectContaining({
          paymentStatus: OrderPaymentStatus.REVIEW_REQUIRED,
          paystackReference: 'late-paystack-ref',
        }),
      }),
    );
    expect(tx.inventoryReservation.updateMany).not.toHaveBeenCalled();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(result?.paymentStatus).toBe(OrderPaymentStatus.REVIEW_REQUIRED);
  });

  it('subtracts refunded units from product sales once the provider confirms the refund', async () => {
    tx.order.findFirst.mockResolvedValue({ id: 'order-id' });
    tx.returnRequest = {
      findFirst: jest.fn().mockResolvedValue({
        items: [{ productId: 'product-id', quantity: 1 }],
      }),
    };
    tx.$executeRaw = jest.fn();

    await repository.finishRefundReservation('order-id', 'return-id', 100, true);

    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-id' },
        data: expect.objectContaining({
          refundInProgressRequestId: null,
          refundedAmount: { increment: 100 },
        }),
      }),
    );
  });
});
