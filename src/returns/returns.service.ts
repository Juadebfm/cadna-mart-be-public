import {
  BadRequestException,
  BadGatewayException,
  ForbiddenException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createPublicId } from '@database/id.util';
import {
  RefundMethod,
  RefundStatus,
  ReturnRequest,
  ReturnStatus,
  ReturnRequestType,
  SellerReviewStatus,
} from './schemas/return-request.schema';
import { ReturnsRepository } from './returns.repository';
import { CreateReturnDto } from './dto/create-return.dto';
import { ProcessRefundDto } from './dto/process-refund.dto';
import { OrdersRepository } from '@orders/orders.repository';
import { OrderPaymentStatus, OrderStatus } from '@orders/schemas/order.schema';
import { PaymentsService } from '@payments/payments.service';
import { UploadService } from '../upload/upload.service';

@Injectable()
export class ReturnsService {
  constructor(
    private readonly repo: ReturnsRepository,
    private readonly ordersRepository: OrdersRepository,
    private readonly paymentsService: PaymentsService,
    private readonly uploadService: UploadService,
  ) {}

  private toDto(r: ReturnRequest, sellerId?: string): object {
    const id = (r as unknown as { _id: { toString(): string } })._id.toString();
    const visibleItems = (r.items ?? []).filter((item) => !sellerId || item.sellerId === sellerId);
    return {
      id,
      ...(sellerId ? {} : { userId: r.userId }),
      orderId: r.orderId,
      orderRef: r.orderRef,
      requestType: r.requestType,
      items: visibleItems,
      orderItemProductId: visibleItems[0]?.productId,
      orderItemVariantId: visibleItems[0]?.variantId,
      orderItemName: visibleItems[0]?.name,
      quantity: visibleItems[0]?.quantity,
      reason: r.reason,
      description: r.description,
      evidenceUrls: r.evidenceUrls,
      status: r.status,
      sellerDecision: r.sellerDecision,
      sellerDecisionNote: r.sellerDecisionNote,
      sellerDecidedAt: r.sellerDecidedAt,
      adminOverrideNote: r.adminOverrideNote,
      refundStatus: r.refundStatus,
      refundProviderStatus: r.refundProviderStatus,
      refundMethod: r.refundMethod,
      refundAmount: r.refundAmount,
      refundReference: r.refundReference,
      refundProcessedAt: r.refundProcessedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async create(userId: string, dto: CreateReturnDto): Promise<object> {
    const order = await this.ordersRepository.findById(dto.orderId);
    if (!order || order.userId?.toString() !== userId) {
      throw new NotFoundException('Order not found');
    }
    if (order.paymentStatus !== OrderPaymentStatus.PAID) {
      throw new BadRequestException('A money-back request requires a paid order');
    }

    const isCancellation = dto.requestType === ReturnRequestType.ORDER_CANCELLATION;
    if (isCancellation && ![OrderStatus.CONFIRMED, OrderStatus.PROCESSING].includes(order.status)) {
      throw new BadRequestException('Whole-order cancellation is available only before shipment');
    }
    if (!isCancellation && ![OrderStatus.SHIPPED, OrderStatus.DELIVERED].includes(order.status)) {
      throw new BadRequestException('Item returns are available after shipment');
    }

    const selectedItems = isCancellation
      ? order.items
      : order.items.filter(
          (item) =>
            item.productId === dto.orderItemProductId &&
            (dto.orderItemVariantId ?? null) === (item.variantId ?? null),
        );
    if (!selectedItems.length)
      throw new BadRequestException('Order item was not found on this order');
    const purchasedQuantity = selectedItems.reduce((sum, item) => sum + item.quantity, 0);
    if (!isCancellation && (!dto.quantity || dto.quantity > purchasedQuantity)) {
      throw new BadRequestException(
        'Requested quantity exceeds the quantity still eligible for return',
      );
    }
    let remainingQuantity = isCancellation ? undefined : dto.quantity;
    const lines = selectedItems.flatMap((item) => {
      if (!item.sellerId) throw new BadRequestException('This order item has no seller assigned');
      const quantity = isCancellation
        ? item.quantity
        : Math.min(item.quantity, remainingQuantity ?? 0);
      if (!isCancellation) remainingQuantity = (remainingQuantity ?? 0) - quantity;
      if (!quantity) return [];
      const lineTotal = item.quantity
        ? Math.round((item.lineTotal.amount * quantity) / item.quantity)
        : 0;
      return [
        {
          productId: item.productId,
          variantId: item.variantId,
          name: item.name,
          quantity,
          sellerId: item.sellerId,
          lineTotal,
          sellerDecision: SellerReviewStatus.PENDING,
          sellerDecisionNote: null,
          sellerDecidedAt: null,
        },
      ];
    });

    const requestId = createPublicId();
    const data: Partial<ReturnRequest> = {
      _id: requestId as unknown as ReturnRequest['_id'],
      userId: userId as unknown as ReturnRequest['userId'],
      orderId: dto.orderId as unknown as ReturnRequest['orderId'],
      orderRef: order.orderRef,
      requestType: dto.requestType,
      previousOrderStatus: isCancellation ? order.status : null,
      items: lines,
      orderItemProductId: lines[0].productId,
      orderItemVariantId: lines[0].variantId,
      orderItemName: lines[0].name,
      quantity: lines[0].quantity,
      reason: dto.reason,
      description: dto.description ?? null,
      evidenceUrls: [],
      status: ReturnStatus.PENDING,
      paymentReference: order.paystackReference,
    };

    if (!isCancellation) {
      const quantityReserved = await this.ordersRepository.reserveReturnQuantity(
        dto.orderId,
        requestId.toString(),
        dto.orderItemProductId!,
        dto.orderItemVariantId ?? null,
        dto.quantity!,
        purchasedQuantity,
      );
      if (!quantityReserved) {
        throw new BadRequestException(
          'Requested quantity exceeds the quantity still eligible for return',
        );
      }
    }

    if (isCancellation) {
      const locked = await this.ordersRepository.transitionStatusIfCurrent(
        dto.orderId,
        [order.status],
        OrderStatus.REFUND_REQUESTED,
        'Buyer requested order cancellation and refund',
      );
      if (!locked)
        throw new BadRequestException(
          'Order status changed; refresh before requesting cancellation',
        );
    }
    let created: ReturnRequest;
    try {
      created = await this.repo.create(data);
    } catch (error) {
      if (isCancellation) {
        await this.ordersRepository.transitionStatusIfCurrent(
          dto.orderId,
          [OrderStatus.REFUND_REQUESTED],
          order.status,
          'Cancellation request creation failed; restored order status',
        );
      }
      if (!isCancellation) {
        await this.ordersRepository.releaseReturnQuantity(dto.orderId, requestId.toString());
      }
      throw error;
    }
    return this.toDto(created);
  }

  async findByUser(userId: string, page = 1, limit = 20): Promise<object> {
    const { items, totalItems } = await this.repo.findByUserId(userId, page, limit);
    return {
      items: items.map((r) => this.toDto(r)),
      pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };
  }

  async findById(id: string, userId?: string): Promise<object> {
    const r = await this.repo.findById(id);
    if (!r) throw new NotFoundException('Return request not found');
    if (userId && r.userId.toString() !== userId) throw new ForbiddenException('Access denied');
    return this.toDto(r);
  }

  async cancel(id: string, userId: string): Promise<object> {
    const r = await this.repo.findById(id);
    if (!r) throw new NotFoundException('Return request not found');
    if (r.userId.toString() !== userId) throw new ForbiddenException('Access denied');
    if (r.status !== ReturnStatus.PENDING) {
      throw new BadRequestException('Only pending return requests can be cancelled');
    }
    const updated = await this.repo.cancelPending(id, userId);
    if (!updated) throw new BadRequestException('Request can no longer be cancelled');
    if (updated.requestType === ReturnRequestType.ITEM_RETURN) {
      await this.ordersRepository.releaseReturnQuantity(updated.orderId.toString(), id);
    }
    if (
      updated.requestType === ReturnRequestType.ORDER_CANCELLATION &&
      updated.previousOrderStatus
    ) {
      const restored = await this.ordersRepository.transitionStatusIfCurrent(
        updated.orderId.toString(),
        [OrderStatus.REFUND_REQUESTED],
        updated.previousOrderStatus as OrderStatus,
        'Buyer withdrew cancellation request',
      );
      if (!restored) {
        throw new InternalServerErrorException(
          'Cancellation was withdrawn, but the order state could not be restored; contact support',
        );
      }
    }
    return this.toDto(updated);
  }

  async addEvidence(id: string, userId: string, publicIds: string[]): Promise<object> {
    const r = await this.repo.findById(id);
    if (!r) throw new NotFoundException('Return request not found');
    if (r.userId.toString() !== userId) throw new ForbiddenException('Access denied');
    if (r.status !== ReturnStatus.PENDING) {
      throw new BadRequestException('Evidence can only be added to pending return requests');
    }
    const existing = r.evidenceUrls ?? [];
    if (existing.length + publicIds.length > 5) {
      throw new BadRequestException('A return request can have at most five evidence images');
    }
    if (new Set(publicIds).size !== publicIds.length) {
      throw new BadRequestException('Duplicate evidence images are not allowed');
    }
    const urls = publicIds.map(
      (publicId) => this.uploadService.resolveOwnedImage(publicId, 'support', userId).url,
    );
    const updated = await this.repo.update(id, {
      evidenceUrls: [...existing, ...urls],
    } as Partial<ReturnRequest>);
    if (!updated) throw new NotFoundException('Return request not found after update');
    return this.toDto(updated);
  }

  checkEligibility(orderItemId: string): object {
    return {
      orderItemId,
      eligible: null,
      windowDays: null,
      note: 'Eligibility depends on the order, shipment, item condition, and reason. Statutory consumer rights are reviewed case by case.',
    };
  }

  async processRefund(returnId: string, dto: ProcessRefundDto, adminId: string): Promise<object> {
    const r = await this.repo.findById(returnId);
    if (!r) throw new NotFoundException('Return request not found');
    if (r.status !== ReturnStatus.APPROVED)
      throw new BadRequestException('Request must be approved before refund');
    if (dto.refundMethod !== RefundMethod.ORIGINAL_PAYMENT) {
      throw new BadRequestException(
        'Only refunds to the original payment method are currently supported',
      );
    }
    const order = await this.ordersRepository.findById(r.orderId.toString());
    if (!order || order.paymentStatus !== OrderPaymentStatus.PAID || !order.paystackReference) {
      throw new BadRequestException('Order has no eligible Paystack payment to refund');
    }
    const expectedAmount =
      r.requestType === ReturnRequestType.ORDER_CANCELLATION
        ? order.pricing.total.amount
        : r.items.reduce((sum, item) => sum + item.lineTotal, 0);
    if (!Number.isSafeInteger(expectedAmount) || expectedAmount <= 0) {
      throw new BadRequestException('Calculated refund amount is invalid');
    }
    if (dto.refundAmount <= 0 || dto.refundAmount > order.pricing.total.amount) {
      throw new BadRequestException(
        'Refund amount must be positive and cannot exceed the order total',
      );
    }
    if (
      r.requestType === ReturnRequestType.ORDER_CANCELLATION &&
      dto.refundAmount !== expectedAmount
    ) {
      throw new BadRequestException('Whole-order cancellation refunds must equal the order total');
    }
    if (dto.refundAmount !== expectedAmount && !dto.note?.trim()) {
      throw new BadRequestException(
        'An adjustment reason is required when refunding a different amount',
      );
    }
    if (r.refundStatus === RefundStatus.PROCESSING || r.refundStatus === RefundStatus.COMPLETED) {
      throw new BadRequestException('A refund is already in progress or completed');
    }
    const reserved = await this.ordersRepository.reserveRefund(
      r.orderId.toString(),
      returnId,
      dto.refundAmount,
    );
    if (!reserved)
      throw new BadRequestException(
        'Another refund is in progress or the remaining refundable balance is insufficient',
      );
    const updated = await this.repo.startRefund(returnId, {
      refundStatus: RefundStatus.PROCESSING,
      refundMethod: dto.refundMethod,
      refundAmount: dto.refundAmount,
      adminOverrideNote: dto.note ?? null,
      adjustmentReason: dto.refundAmount !== expectedAmount ? dto.note!.trim() : null,
      adminOverrideBy: adminId as unknown as ReturnRequest['adminOverrideBy'],
      refundProcessedAt: new Date(),
    } as Partial<ReturnRequest>);
    if (!updated) {
      await this.ordersRepository.finishRefundReservation(
        r.orderId.toString(),
        returnId,
        dto.refundAmount,
        false,
      );
      throw new BadRequestException(
        'Refund processing has already started or request is no longer approved',
      );
    }
    let providerResult: {
      refundReference?: string | null;
      refundId?: string | null;
      status?: string;
    };
    try {
      providerResult = (await this.paymentsService.initializeRefund(
        r.orderId.toString(),
        dto.refundAmount,
        returnId,
      )) as { refundReference?: string | null; refundId?: string | null; status?: string };
    } catch (error) {
      // Keep the reservation on network/timeout ambiguity to prevent a duplicate refund.
      if (
        error instanceof BadRequestException ||
        error instanceof BadGatewayException ||
        error instanceof InternalServerErrorException
      ) {
        await this.ordersRepository.finishRefundReservation(
          r.orderId.toString(),
          returnId,
          dto.refundAmount,
          false,
        );
        await this.repo.update(returnId, {
          refundStatus: RefundStatus.FAILED,
        } as Partial<ReturnRequest>);
      }
      throw error;
    }
    const saved = await this.repo.update(returnId, {
      refundReference: providerResult.refundReference ?? null,
      refundProviderId: providerResult.refundId ?? null,
      refundProviderStatus: providerResult.status ?? 'pending',
    } as Partial<ReturnRequest>);
    return this.toDto(saved ?? updated);
  }

  async handlePaystackRefundEvent(payload: unknown): Promise<void> {
    const event = payload as {
      event?: string;
      data?: {
        transaction_reference?: string;
        refund_reference?: string | null;
        id?: string | number;
        amount?: string | number;
        currency?: string;
        status?: string;
      };
    };
    if (!event.event?.startsWith('refund.')) return;
    const { transaction_reference, refund_reference, id, amount, currency } = event.data ?? {};
    // Transaction references are shared by every partial refund for an order.
    // Never apply an event without its unique refund reference to the "latest" request.
    const refundProviderId = id?.toString();
    if (
      !transaction_reference ||
      (!refund_reference && !refundProviderId) ||
      amount === undefined ||
      currency !== 'NGN'
    )
      return;
    const request = await this.repo.findProcessingByProviderRefund(
      transaction_reference,
      refund_reference ?? undefined,
      refundProviderId,
    );
    if (!request) return;
    const amountInMinorUnits = Number(amount);
    if (
      !Number.isSafeInteger(amountInMinorUnits) ||
      amountInMinorUnits !== request.refundAmount * 100
    ) {
      return;
    }
    const status = event.event.slice('refund.'.length);
    const refundStatus =
      status === 'processed'
        ? RefundStatus.COMPLETED
        : status === 'failed'
          ? RefundStatus.FAILED
          : RefundStatus.PROCESSING;
    const requestId = (request as unknown as { _id: string })._id.toString();
    const updated =
      status === 'processed' || status === 'failed'
        ? await this.repo.applyFinalProviderStatus(
            requestId,
            refundStatus,
            status,
            refund_reference ?? request.refundReference,
          )
        : await this.repo.update(requestId, {
            refundProviderStatus: status,
            refundReference: refund_reference ?? request.refundReference,
          } as Partial<ReturnRequest>);
    if (!updated) return;
    if (status === 'processed' || status === 'failed') {
      await this.ordersRepository.finishRefundReservation(
        request.orderId.toString(),
        requestId,
        request.refundAmount,
        status === 'processed',
      );
    }
    if (status === 'processed' && updated?.requestType === ReturnRequestType.ORDER_CANCELLATION) {
      const order = await this.ordersRepository.findById(updated.orderId.toString());
      if (order && order.refundedAmount + request.refundAmount >= order.pricing.total.amount) {
        await this.ordersRepository.update(updated.orderId.toString(), {
          paymentStatus: OrderPaymentStatus.REFUNDED,
        });
        await this.ordersRepository.transitionStatusIfCurrent(
          updated.orderId.toString(),
          [OrderStatus.REFUND_REQUESTED],
          OrderStatus.REFUNDED,
          'Refund processed',
        );
      }
    }
    if (
      status === 'failed' &&
      updated?.requestType === ReturnRequestType.ORDER_CANCELLATION &&
      updated.previousOrderStatus
    ) {
      await this.ordersRepository.transitionStatusIfCurrent(
        updated.orderId.toString(),
        [OrderStatus.REFUND_REQUESTED],
        updated.previousOrderStatus as OrderStatus,
        'Refund failed; order requires manual review',
      );
    }
  }

  async reconcileRefund(returnId: string): Promise<object> {
    const request = await this.repo.findById(returnId);
    if (!request) throw new NotFoundException('Return request not found');
    if (request.refundStatus !== RefundStatus.PROCESSING || !request.refundProviderId) {
      throw new BadRequestException(
        'Only a processing refund with a Paystack refund ID can be reconciled',
      );
    }
    const order = await this.ordersRepository.findById(request.orderId.toString());
    if (!order || !request.paymentReference || !order.paystackReference) {
      throw new BadRequestException('Refund is missing its original payment reference');
    }
    const providerRefund = await this.paymentsService.fetchRefund(request.refundProviderId);
    if (
      providerRefund.id !== request.refundProviderId ||
      providerRefund.transactionReference !== request.paymentReference ||
      providerRefund.transactionReference !== order.paystackReference ||
      providerRefund.amount !== request.refundAmount * 100 ||
      providerRefund.currency !== 'NGN'
    ) {
      throw new BadGatewayException(
        'Paystack refund details do not match the local refund request',
      );
    }
    const supportedStatuses = new Set([
      'pending',
      'processing',
      'needs-attention',
      'processed',
      'failed',
    ]);
    if (!supportedStatuses.has(providerRefund.status)) {
      throw new BadGatewayException('Paystack returned an unsupported refund status');
    }
    await this.handlePaystackRefundEvent({
      event: `refund.${providerRefund.status}`,
      data: {
        transaction_reference: providerRefund.transactionReference,
        refund_reference: providerRefund.refundReference,
        id: providerRefund.id,
        amount: providerRefund.amount,
        currency: providerRefund.currency,
      },
    });
    return this.getRefundStatus(returnId, request.userId.toString(), true);
  }

  async getRefundStatus(id: string, userId: string, isAdmin: boolean): Promise<object> {
    const r = isAdmin ? await this.repo.findById(id) : await this.repo.findByIdAndUser(id, userId);
    if (!r) throw new NotFoundException('Return / refund not found');
    return {
      returnId: id,
      refundStatus: r.refundStatus,
      refundProviderStatus: r.refundProviderStatus,
      refundMethod: r.refundMethod,
      refundAmount: r.refundAmount,
      refundReference: r.refundReference,
      refundProcessedAt: r.refundProcessedAt,
    };
  }

  async findAll(page = 1, limit = 20, status?: ReturnStatus): Promise<object> {
    const { items, totalItems } = await this.repo.findAll(page, limit, status);
    return {
      items: items.map((r) => this.toDto(r)),
      pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };
  }

  async findRefunds(page = 1, limit = 20): Promise<object> {
    const { items, totalItems } = await this.repo.findRefunds(page, limit);
    return {
      items: items.map((r) => this.toDto(r)),
      pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };
  }

  async adminDecision(
    id: string,
    decision: 'approve' | 'reject',
    note: string | undefined,
    adminId: string,
  ): Promise<object> {
    const r = await this.repo.findById(id);
    if (!r) throw new NotFoundException('Return request not found');
    if (r.refundStatus)
      throw new BadRequestException('A request with a refund in progress cannot be changed');
    if (decision === 'approve' && r.status === ReturnStatus.REJECTED && r.adminOverrideBy) {
      throw new BadRequestException('An admin-finalized rejection cannot be approved again');
    }
    const rejectedBySeller = (r.items ?? []).some(
      (item) => item.sellerDecision === SellerReviewStatus.REJECTED,
    );
    if (
      decision === 'approve' &&
      r.requestType === ReturnRequestType.ORDER_CANCELLATION &&
      (r.items ?? []).some((item) => item.sellerDecision === SellerReviewStatus.PENDING)
    ) {
      throw new BadRequestException(
        'Each affected seller must provide input before admin approval',
      );
    }
    if (
      decision === 'approve' &&
      r.requestType === ReturnRequestType.ORDER_CANCELLATION &&
      rejectedBySeller &&
      !note?.trim()
    ) {
      throw new BadRequestException(
        'A reason is required when admin approves over a seller objection',
      );
    }
    if (
      decision === 'approve' &&
      r.requestType === ReturnRequestType.ITEM_RETURN &&
      (r.items ?? []).some((item) => item.sellerDecision === SellerReviewStatus.PENDING)
    ) {
      throw new BadRequestException(
        'Each affected seller must review their item before admin approval',
      );
    }
    if (
      decision === 'approve' &&
      r.requestType === ReturnRequestType.ITEM_RETURN &&
      rejectedBySeller &&
      !note?.trim()
    ) {
      throw new BadRequestException('A reason is required when admin overrides a seller rejection');
    }
    const status = decision === 'approve' ? ReturnStatus.APPROVED : ReturnStatus.REJECTED;
    const updated = await this.repo.decideByAdmin(id, {
      status,
      adminOverrideNote: note ?? null,
      adminOverrideBy: adminId as unknown as ReturnRequest['adminOverrideBy'],
    } as Partial<ReturnRequest>);
    if (!updated)
      throw new BadRequestException(
        'Request status changed; refresh before making another decision',
      );
    if (
      decision === 'reject' &&
      updated.requestType === ReturnRequestType.ORDER_CANCELLATION &&
      updated.previousOrderStatus
    ) {
      const restored = await this.ordersRepository.transitionStatusIfCurrent(
        updated.orderId.toString(),
        [OrderStatus.REFUND_REQUESTED],
        updated.previousOrderStatus as OrderStatus,
        'Admin rejected buyer cancellation request',
      );
      if (!restored) {
        throw new InternalServerErrorException(
          'Cancellation was rejected, but the order state could not be restored; contact support',
        );
      }
    }
    if (decision === 'reject' && updated.requestType === ReturnRequestType.ITEM_RETURN) {
      await this.ordersRepository.releaseReturnQuantity(updated.orderId.toString(), id);
    }
    return this.toDto(updated);
  }

  async sellerDecision(
    id: string,
    decision: 'approve' | 'reject',
    note: string | undefined,
    sellerProductIds: string[],
  ): Promise<object> {
    const r = await this.repo.findById(id);
    if (!r) throw new NotFoundException('Return request not found');
    const sellerId = sellerProductIds[0];
    if (!r.items?.some((item) => item.sellerId === sellerId)) {
      throw new ForbiddenException('This return is not for one of your products');
    }
    if (r.status !== ReturnStatus.PENDING) {
      throw new BadRequestException('Decision can only be set on pending returns');
    }
    const updated = await this.repo.decideForSeller(
      id,
      sellerId,
      decision === 'approve' ? SellerReviewStatus.APPROVED : SellerReviewStatus.REJECTED,
      note ?? null,
    );
    if (!updated) throw new NotFoundException('Return request not found after update');
    const reviews = updated.items ?? [];
    const allApproved =
      reviews.length > 0 &&
      reviews.every((item) => item.sellerDecision === SellerReviewStatus.APPROVED);
    const hasSellerRejection = reviews.some(
      (item) => item.sellerDecision === SellerReviewStatus.REJECTED,
    );
    const isAdminDecidedCancellation = updated.requestType === ReturnRequestType.ORDER_CANCELLATION;
    const final = isAdminDecidedCancellation
      ? updated
      : hasSellerRejection
        ? await this.repo.update(id, { status: ReturnStatus.REJECTED } as Partial<ReturnRequest>)
        : allApproved
          ? await this.repo.update(id, { status: ReturnStatus.APPROVED } as Partial<ReturnRequest>)
          : updated;
    if (!final) throw new NotFoundException('Return request not found after seller decision');
    return this.toDto(final, sellerId);
  }

  async findBySeller(productIds: string[], page = 1, limit = 20): Promise<object> {
    const { items, totalItems } = await this.repo.findAllBySeller(productIds, page, limit);
    return {
      items: items.map((r) => this.toDto(r, productIds[0])),
      pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };
  }

  formatMoney(amount: number): object {
    return { amount, currency: 'NGN', formatted: '₦' + Math.round(amount).toLocaleString('en-NG') };
  }

  buildRefundList(items: ReturnRequest[]): object[] {
    return items
      .filter((r) => r.refundStatus !== null)
      .map((r) => {
        const id = (r as unknown as { _id: { toString(): string } })._id.toString();
        return {
          refundId: id,
          returnId: id,
          refundStatus: r.refundStatus,
          refundProviderStatus: r.refundProviderStatus,
          refundMethod: r.refundMethod as RefundMethod,
          refundAmount: this.formatMoney(r.refundAmount),
          refundReference: r.refundReference,
          refundProcessedAt: r.refundProcessedAt,
        };
      });
  }
}
