import { BaseSchema } from '@shared/base/base.schema';
export enum BookingStatus {
  PENDING_PAYMENT = 'pending_payment',
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  SUSPENDED = 'suspended',
}
export enum BookingPaymentStatus {
  UNPAID = 'unpaid',
  PAID = 'paid',
  REFUNDED = 'refunded',
}
export class SlotBooking extends BaseSchema {
  sellerId!: string;
  slotId!: string;
  durationTierId!: string;
  productId!: string;
  amountPaidNGN!: number;
  status!: BookingStatus;
  paymentStatus!: BookingPaymentStatus;
  paystackReference!: string | null;
  paystackAuthUrl!: string | null;
  activatedAt!: Date | null;
  expiresAt!: Date | null;
  suspendReason!: string | null;
  suspendedBy!: string | null;
  impressions!: number;
  clicks!: number;
  orders!: number;
}
