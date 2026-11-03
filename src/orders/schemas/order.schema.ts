import { BaseSchema } from '@shared/base/base.schema';
export enum OrderStatus {
  PENDING_PAYMENT = 'pending_payment',
  CONFIRMED = 'confirmed',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  REFUND_REQUESTED = 'refund_requested',
  REFUNDED = 'refunded',
}
export enum OrderPaymentStatus {
  UNPAID = 'unpaid',
  AWAITING_VERIFICATION = 'awaiting_verification',
  PAID = 'paid',
  REVIEW_REQUIRED = 'review_required',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}
export enum OrderPaymentMethod {
  PAYSTACK = 'paystack',
  BANK_TRANSFER = 'bank_transfer',
  PAY_ON_DELIVERY = 'pay_on_delivery',
}
export enum DeliveryMode {
  STANDARD = 'standard',
  EXPRESS = 'express',
  PICKUP = 'pickup',
  MULTIPLE = 'multiple',
}
export interface MoneySnapshot {
  amount: number;
  currency: string;
  formatted: string;
}
export interface OrderItemSnapshot {
  productId: string;
  variantId: string | null;
  name: string;
  sku: string | null;
  thumbnailUrl: string | null;
  unitPrice: MoneySnapshot;
  quantity: number;
  lineTotal: MoneySnapshot;
  sellerId: string | null;
  deliveryMethod: string;
  shippingWeightGrams: number | null;
}
export interface DeliveryChargeSnapshot {
  groupKey: string;
  sellerId: string;
  method: string;
  logisticsCategoryId?: number | null;
  weightGrams: number;
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    weightKg?: number;
    value?: number;
  }>;
  fee: MoneySnapshot | null;
  status: 'priced' | 'unavailable';
  reason?:
    'live_quote_unavailable' | 'missing_weight' | 'no_matching_rate' | 'missing_parcel_details';
  rateId?: string;
  quoteId?: string;
  quoteExpiresAt?: string;
  courierOptions?: Array<{
    courierId: string;
    courierName: string;
    serviceCode: string;
    amount: number;
    fee: number;
    total: number;
  }>;
  courierId?: string;
  courierName?: string;
  serviceCode?: string;
}
export interface OrderPricing {
  subtotal: MoneySnapshot;
  deliveryFee: MoneySnapshot;
  deliveryBreakdown?: DeliveryChargeSnapshot[];
  tax: MoneySnapshot;
  total: MoneySnapshot;
  currency: string;
}
export interface DeliveryAddressSnapshot {
  recipientName: string;
  phoneNumber: string;
  street1: string;
  street2: string | null;
  notes?: string | null;
  city: string;
  lga?: string | null;
  state: string;
  country: string;
  postalCode: string | null;
}
export interface PickupDetailsSnapshot {
  contactName: string;
  contactPhone: string;
  vehicleType: string | null;
  scheduledAt: Date | null;
}
export interface OrderTimelineEntry {
  status: OrderStatus;
  timestamp: Date;
  note: string | null;
}
export interface OrderTrackingEvent {
  event: string;
  timestamp: Date;
  location: string | null;
}
export interface ReturnQuantityReservation {
  requestId: string;
  productId: string;
  variantId: string | null;
  quantity: number;
}
export class Order extends BaseSchema {
  orderRef!: string;
  userId!: string | null;
  guestEmail!: string | null;
  guestPhone!: string | null;
  items!: OrderItemSnapshot[];
  deliveryAddress!: DeliveryAddressSnapshot;
  deliveryMode!: DeliveryMode;
  pickupDetails!: PickupDetailsSnapshot | null;
  pricing!: OrderPricing;
  status!: OrderStatus;
  paymentStatus!: OrderPaymentStatus;
  paymentMethod!: OrderPaymentMethod | null;
  paystackReference!: string | null;
  paidAt!: Date | null;
  refundedAmount!: number;
  reservedRefundAmount!: number;
  returnQuantityReservations!: ReturnQuantityReservation[];
  refundInProgressRequestId!: string | null;
  timeline!: OrderTimelineEntry[];
  tracking!: OrderTrackingEvent[];
  cancelReason!: string | null;
  cancelledAt!: Date | null;
  expiresAt!: Date | null;
  cartRef!: string | null;
}
