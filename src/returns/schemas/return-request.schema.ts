import { BaseSchema } from '@shared/base/base.schema';
export enum ReturnStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}
export enum ReturnRequestType {
  ORDER_CANCELLATION = 'order_cancellation',
  ITEM_RETURN = 'item_return',
}
export enum SellerReviewStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}
export interface ReturnLineItem {
  productId: string;
  variantId: string | null;
  name: string;
  quantity: number;
  sellerId: string | null;
  lineTotal: number;
  sellerDecision: SellerReviewStatus;
  sellerDecisionNote: string | null;
  sellerDecidedAt: Date | null;
}
export enum ReturnReason {
  DEFECTIVE = 'defective',
  NOT_AS_DESCRIBED = 'not_as_described',
  WRONG_ITEM = 'wrong_item',
  DAMAGED_IN_TRANSIT = 'damaged_in_transit',
  CHANGED_MIND = 'changed_mind',
  OTHER = 'other',
}
export enum RefundStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}
export enum RefundMethod {
  ORIGINAL_PAYMENT = 'original_payment',
  WALLET = 'wallet',
  BANK_TRANSFER = 'bank_transfer',
}
export class ReturnRequest extends BaseSchema {
  userId!: string;
  requestType!: ReturnRequestType;
  previousOrderStatus!: string | null;
  items!: ReturnLineItem[];
  orderId!: string;
  orderRef!: string;
  orderItemProductId!: string;
  orderItemVariantId!: string | null;
  orderItemName!: string;
  quantity!: number;
  reason!: ReturnReason;
  description!: string | null;
  evidenceUrls!: string[];
  status!: ReturnStatus;
  sellerDecision!: string | null;
  sellerDecisionNote!: string | null;
  sellerDecidedAt!: Date | null;
  adminOverrideNote!: string | null;
  adminOverrideBy!: string | null;
  refundStatus!: RefundStatus | null;
  refundMethod!: RefundMethod | null;
  refundReference!: string | null;
  refundProviderId!: string | null;
  refundProcessedAt!: Date | null;
  refundAmount!: number;
  paymentReference!: string | null;
  refundProviderStatus!: string | null;
  adjustmentReason!: string | null;
}
