import { BaseSchema } from '@shared/base/base.schema';
export enum CheckoutSessionStatus {
  INITIATED = 'initiated',
  ADDRESS_SET = 'address_set',
  DELIVERY_SET = 'delivery_set',
  SUMMARY_READY = 'summary_ready',
  CONFIRMED = 'confirmed',
  EXPIRED = 'expired',
}
export class CheckoutSession extends BaseSchema {
  sessionId!: string;
  cartId!: string;
  userId!: string | null;
  status!: CheckoutSessionStatus;
  deliveryAddress!: object | null;
  addressValidated!: boolean;
  deliveryMode!: string | null;
  pickupDetails!: object | null;
  pricingSnapshot!: object | null;
  pricingLocked!: boolean;
  orderId!: string | null;
  metadata!: object | null;
  expiresAt!: Date;
}
