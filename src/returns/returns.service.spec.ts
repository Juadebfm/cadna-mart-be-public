import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ReturnsService } from './returns.service';
import {
  RefundMethod,
  RefundStatus,
  ReturnRequestType,
  ReturnStatus,
  SellerReviewStatus,
} from './schemas/return-request.schema';
import { OrderPaymentStatus, OrderStatus } from '@orders/schemas/order.schema';

const newId = (): string => Math.random().toString(16).slice(2).padEnd(24, '0').slice(0, 24);

describe('ReturnsService', () => {
  const buyerId = newId();
  const orderId = newId();
  const requestId = newId();
  const order = {
    _id: orderId,
    userId: buyerId,
    orderRef: 'CDN-ORDER-1',
    status: OrderStatus.CONFIRMED,
    paymentStatus: OrderPaymentStatus.PAID,
    paystackReference: 'pay_ref_1',
    pricing: { total: { amount: 12000 } },
    items: [
      {
        productId: 'product-from-order',
        variantId: 'variant-from-order',
        name: 'Snapshot name',
        quantity: 2,
        sellerId: 'seller-1',
        unitPrice: { amount: 5000 },
        lineTotal: { amount: 10000 },
      },
    ],
  };
  let repository: Record<string, jest.Mock>;
  let ordersRepository: Record<string, jest.Mock>;
  let paymentsService: Record<string, jest.Mock>;
  let uploadService: Record<string, jest.Mock>;
  let service: ReturnsService;

  beforeEach(() => {
    repository = {
      create: jest.fn(async (data) => ({ ...data, _id: requestId })),
      findByOrderId: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      findProcessingByProviderRefund: jest.fn(),
      applyFinalProviderStatus: jest.fn(),
      decideForSeller: jest.fn(),
      decideByAdmin: jest.fn(),
      cancelPending: jest.fn(),
      startRefund: jest.fn(),
      update: jest.fn(),
    };
    ordersRepository = {
      findById: jest.fn().mockResolvedValue(order),
      updateStatus: jest.fn(),
      transitionStatusIfCurrent: jest.fn().mockResolvedValue({}),
      reserveReturnQuantity: jest.fn().mockResolvedValue(true),
      releaseReturnQuantity: jest.fn(),
      reserveRefund: jest.fn().mockResolvedValue(true),
      finishRefundReservation: jest.fn(),
    };
    paymentsService = {
      initializeRefund: jest
        .fn()
        .mockResolvedValue({ refundReference: 'refund-1', status: 'pending' }),
      fetchRefund: jest.fn(),
    };
    uploadService = {
      resolveOwnedImage: jest.fn((publicId: string) => ({
        publicId,
        url: `https://cdn.example/${publicId}`,
      })),
    };
    service = new ReturnsService(
      repository as never,
      ordersRepository as never,
      paymentsService as never,
      uploadService as never,
    );
  });

  it('rejects orders not owned by the requesting buyer without creating a request', async () => {
    ordersRepository.findById.mockResolvedValue({ ...order, userId: newId() });

    await expect(
      service.create(buyerId, {
        orderId,
        requestType: ReturnRequestType.ITEM_RETURN,
        orderItemProductId: 'product-from-order',
        orderItemVariantId: 'variant-from-order',
        quantity: 1,
        reason: 'defective' as never,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(repository.create).not.toHaveBeenCalled();
  });

  it('creates a paid-order cancellation from the saved order snapshot and holds the order', async () => {
    await service.create(buyerId, {
      orderId,
      requestType: ReturnRequestType.ORDER_CANCELLATION,
      orderItemProductId: 'forged-product-id',
      orderItemName: 'forged product name',
      quantity: 999,
      reason: 'other' as never,
    } as never);

    const saved = repository.create.mock.calls[0][0] as Record<string, unknown>;
    expect(saved.orderRef).toBe('CDN-ORDER-1');
    expect(saved.orderItemProductId).toBe('product-from-order');
    expect(saved.orderItemName).toBe('Snapshot name');
    expect(saved.quantity).toBe(2);
    expect(saved['items']).toEqual([
      expect.objectContaining({
        productId: 'product-from-order',
        sellerId: 'seller-1',
        quantity: 2,
        sellerDecision: SellerReviewStatus.PENDING,
      }),
    ]);
    expect(ordersRepository.transitionStatusIfCurrent).toHaveBeenCalledWith(
      orderId,
      [OrderStatus.CONFIRMED],
      OrderStatus.REFUND_REQUESTED,
      'Buyer requested order cancellation and refund',
    );
  });

  it('does not refund until seller review has approved the request', async () => {
    repository.findById.mockResolvedValue({
      _id: requestId,
      orderId: orderId,
      status: ReturnStatus.PENDING,
      requestType: ReturnRequestType.ITEM_RETURN,
      items: [{ lineTotal: 5000 }],
      refundStatus: null,
    });

    await expect(
      service.processRefund(
        requestId,
        {
          refundMethod: RefundMethod.ORIGINAL_PAYMENT,
          refundAmount: 5000,
        },
        newId(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ordersRepository.reserveRefund).not.toHaveBeenCalled();
    expect(paymentsService.initializeRefund).not.toHaveBeenCalled();
  });

  it('uses the order repository atomic quantity reservation before creating an item return', async () => {
    ordersRepository.findById.mockResolvedValue({
      ...order,
      status: OrderStatus.SHIPPED,
    });
    ordersRepository.reserveReturnQuantity.mockResolvedValue(false);

    await expect(
      service.create(buyerId, {
        orderId,
        requestType: ReturnRequestType.ITEM_RETURN,
        orderItemProductId: 'product-from-order',
        orderItemVariantId: 'variant-from-order',
        quantity: 1,
        reason: 'defective' as never,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ordersRepository.reserveReturnQuantity).toHaveBeenCalledWith(
      orderId,
      expect.any(String),
      'product-from-order',
      'variant-from-order',
      1,
      2,
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('keeps whole-order cancellation pending after a seller objects for admin decision', async () => {
    const pendingCancellation = {
      _id: requestId,
      orderId: orderId,
      orderRef: 'CDN-ORDER-1',
      requestType: ReturnRequestType.ORDER_CANCELLATION,
      status: ReturnStatus.PENDING,
      items: [
        {
          productId: 'product-from-order',
          sellerId: 'seller-1',
          sellerDecision: SellerReviewStatus.PENDING,
        },
      ],
    };
    repository.findById.mockResolvedValue(pendingCancellation);
    repository.decideForSeller.mockResolvedValue({
      ...pendingCancellation,
      items: [{ ...pendingCancellation.items[0], sellerDecision: SellerReviewStatus.REJECTED }],
    });

    const result = await service.sellerDecision(requestId, 'reject', 'Seller disagrees', [
      'seller-1',
    ]);

    expect((result as { status: ReturnStatus }).status).toBe(ReturnStatus.PENDING);
    expect(repository.update).not.toHaveBeenCalled();
    expect(ordersRepository.transitionStatusIfCurrent).not.toHaveBeenCalled();
  });

  it('requires an admin reason to approve cancellation over a seller objection', async () => {
    repository.findById.mockResolvedValue({
      _id: requestId,
      orderId: orderId,
      requestType: ReturnRequestType.ORDER_CANCELLATION,
      status: ReturnStatus.PENDING,
      refundStatus: null,
      items: [{ sellerDecision: SellerReviewStatus.REJECTED }],
    });

    await expect(
      service.adminDecision(requestId, 'approve', undefined, newId()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.decideByAdmin).not.toHaveBeenCalled();
  });

  it('restores the prior order state when the buyer withdraws a cancellation request', async () => {
    const pendingCancellation = {
      _id: requestId,
      userId: buyerId,
      orderId: orderId,
      requestType: ReturnRequestType.ORDER_CANCELLATION,
      previousOrderStatus: OrderStatus.CONFIRMED,
      status: ReturnStatus.PENDING,
      items: [],
    };
    repository.findById.mockResolvedValue(pendingCancellation);
    repository.cancelPending.mockResolvedValue({
      ...pendingCancellation,
      status: ReturnStatus.CANCELLED,
    });

    await service.cancel(requestId, buyerId);

    expect(ordersRepository.transitionStatusIfCurrent).toHaveBeenCalledWith(
      orderId,
      [OrderStatus.REFUND_REQUESTED],
      OrderStatus.CONFIRMED,
      'Buyer withdrew cancellation request',
    );
  });

  it('rejects admin refund amounts above the order total before reserving money', async () => {
    repository.findById.mockResolvedValue({
      _id: requestId,
      orderId: orderId,
      status: ReturnStatus.APPROVED,
      requestType: ReturnRequestType.ITEM_RETURN,
      items: [{ lineTotal: 5000 }],
      refundStatus: null,
    });

    await expect(
      service.processRefund(
        requestId,
        {
          refundMethod: RefundMethod.ORIGINAL_PAYMENT,
          refundAmount: 12001,
        },
        newId(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ordersRepository.reserveRefund).not.toHaveBeenCalled();
  });

  it('does not match a refund event by the shared transaction reference alone', async () => {
    await service.handlePaystackRefundEvent({
      event: 'refund.processed',
      data: {
        transaction_reference: 'pay_ref_1',
        refund_reference: null,
        amount: '500000',
        currency: 'NGN',
      },
    });

    expect(repository.findProcessingByProviderRefund).not.toHaveBeenCalled();
    expect(repository.applyFinalProviderStatus).not.toHaveBeenCalled();
  });

  it('requires an exact provider refund identifier and amount before applying a refund event', async () => {
    repository.findProcessingByProviderRefund.mockResolvedValue({
      _id: requestId,
      orderId: orderId,
      refundAmount: 5000,
      refundReference: 'refund-1',
      requestType: ReturnRequestType.ITEM_RETURN,
    });

    await service.handlePaystackRefundEvent({
      event: 'refund.processed',
      data: {
        transaction_reference: 'pay_ref_1',
        refund_reference: 'refund-1',
        amount: '499900',
        currency: 'NGN',
      },
    });

    expect(repository.findProcessingByProviderRefund).toHaveBeenCalledWith(
      'pay_ref_1',
      'refund-1',
      undefined,
    );
    expect(repository.applyFinalProviderStatus).not.toHaveBeenCalled();
    expect(ordersRepository.finishRefundReservation).not.toHaveBeenCalled();
  });

  it('matches a Paystack refund event by the provider refund ID when no refund reference exists', async () => {
    const request = {
      _id: requestId,
      orderId: orderId,
      refundAmount: 5000,
      refundReference: null,
      requestType: ReturnRequestType.ITEM_RETURN,
    };
    repository.findProcessingByProviderRefund.mockResolvedValue(request);
    repository.applyFinalProviderStatus.mockResolvedValue({
      ...request,
      refundStatus: 'completed',
    });

    await service.handlePaystackRefundEvent({
      event: 'refund.processed',
      data: {
        transaction_reference: 'pay_ref_1',
        refund_reference: null,
        id: 12345,
        amount: '500000',
        currency: 'NGN',
      },
    });

    expect(repository.findProcessingByProviderRefund).toHaveBeenCalledWith(
      'pay_ref_1',
      undefined,
      '12345',
    );
    expect(repository.applyFinalProviderStatus).toHaveBeenCalledWith(
      requestId,
      'completed',
      'processed',
      null,
    );
    expect(ordersRepository.finishRefundReservation).toHaveBeenCalledWith(
      orderId,
      requestId,
      5000,
      true,
    );
  });

  it('reconciles only when Paystack confirms the same refund, payment, amount, and currency', async () => {
    const request = {
      _id: requestId,
      userId: buyerId,
      orderId: orderId,
      refundStatus: RefundStatus.PROCESSING,
      refundProviderId: '12345',
      refundReference: 'refund-reference-1',
      refundAmount: 5000,
      paymentReference: 'pay_ref_1',
    };
    repository.findById
      .mockResolvedValueOnce(request)
      .mockResolvedValueOnce({ ...request, refundStatus: RefundStatus.COMPLETED });
    repository.findProcessingByProviderRefund.mockResolvedValue(request);
    repository.applyFinalProviderStatus.mockResolvedValue({
      ...request,
      refundStatus: RefundStatus.COMPLETED,
    });
    paymentsService.fetchRefund.mockResolvedValue({
      id: '12345',
      transactionReference: 'pay_ref_1',
      amount: 500000,
      currency: 'NGN',
      status: 'processed',
      refundReference: 'refund-reference-1',
    });

    await service.reconcileRefund(requestId);

    expect(paymentsService.fetchRefund).toHaveBeenCalledWith('12345');
    expect(repository.applyFinalProviderStatus).toHaveBeenCalledWith(
      requestId,
      RefundStatus.COMPLETED,
      'processed',
      'refund-reference-1',
    );
    expect(ordersRepository.finishRefundReservation).toHaveBeenCalledWith(
      orderId,
      requestId,
      5000,
      true,
    );
  });

  it('does not reconcile when the provider amount does not match the request', async () => {
    repository.findById.mockResolvedValue({
      _id: requestId,
      orderId: orderId,
      refundStatus: RefundStatus.PROCESSING,
      refundProviderId: '12345',
      refundAmount: 5000,
      paymentReference: 'pay_ref_1',
    });
    paymentsService.fetchRefund.mockResolvedValue({
      id: '12345',
      transactionReference: 'pay_ref_1',
      amount: 499900,
      currency: 'NGN',
      status: 'processed',
      refundReference: 'refund-reference-1',
    });

    await expect(service.reconcileRefund(requestId)).rejects.toBeInstanceOf(BadGatewayException);
    expect(repository.applyFinalProviderStatus).not.toHaveBeenCalled();
    expect(ordersRepository.finishRefundReservation).not.toHaveBeenCalled();
  });

  it('saves return evidence only from buyer-owned uploads and enforces the total image limit', async () => {
    repository.findById.mockResolvedValue({
      _id: requestId,
      userId: buyerId,
      status: ReturnStatus.PENDING,
      evidenceUrls: ['existing-1', 'existing-2', 'existing-3', 'existing-4'],
    });

    await expect(service.addEvidence(requestId, buyerId, ['new-1', 'new-2'])).rejects.toThrow(
      'at most five evidence images',
    );
    expect(uploadService.resolveOwnedImage).not.toHaveBeenCalled();
    repository.update.mockResolvedValueOnce({
      _id: requestId,
      userId: buyerId,
      status: ReturnStatus.PENDING,
      evidenceUrls: [
        'existing-1',
        'existing-2',
        'existing-3',
        'existing-4',
        'https://cdn.example/new-1',
      ],
    });

    const result = await service.addEvidence(requestId, buyerId, ['new-1']);
    expect(uploadService.resolveOwnedImage).toHaveBeenCalledWith('new-1', 'support', buyerId);
    expect(repository.update).toHaveBeenCalledWith(
      requestId,
      expect.objectContaining({
        evidenceUrls: expect.arrayContaining(['https://cdn.example/new-1']),
      }),
    );
    expect(result).toBeDefined();
  });

  it('does not save a return evidence image owned by another buyer', async () => {
    repository.findById.mockResolvedValue({
      _id: requestId,
      userId: buyerId,
      status: ReturnStatus.PENDING,
      evidenceUrls: [],
    });
    uploadService.resolveOwnedImage.mockImplementationOnce(() => {
      throw new ForbiddenException('You do not own this media asset');
    });

    await expect(service.addEvidence(requestId, buyerId, ['someone-elses-image'])).rejects.toThrow(
      'You do not own this media asset',
    );
    expect(repository.update).not.toHaveBeenCalled();
  });
});
