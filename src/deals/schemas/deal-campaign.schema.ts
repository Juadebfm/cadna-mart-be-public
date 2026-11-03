import { BaseSchema } from '@shared/base/base.schema';
export enum DealCampaignStatus {
  DRAFT = 'draft',
  PENDING_PAYMENT = 'pending_payment',
  SCHEDULED = 'scheduled',
  LIVE = 'live',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}
export enum DealPaymentStatus {
  UNPAID = 'unpaid',
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}
export class DealCampaign extends BaseSchema {
  title!: string;
  seller!: string;
  selectedProductIds!: string[];
  maxProducts!: number;
  feeAmount!: number;
  currency!: 'NGN';
  status!: DealCampaignStatus;
  paymentStatus!: DealPaymentStatus;
  paymentReference!: string | null;
  paymentAuthorizationUrl!: string | null;
  paymentAccessCode!: string | null;
  paidAt!: Date | null;
  startsAt!: Date | null;
  endsAt!: Date | null;
  approvedBy!: string | null;
  approvedAt!: Date | null;
  isActive!: boolean;
}
