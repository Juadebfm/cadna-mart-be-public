import { BaseSchema } from '@shared/base/base.schema';
export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PICKED_UP = 'picked_up',
  IN_TRANSIT = 'in_transit',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}
export enum LogisticsProvider {
  STACKAPI = 'stackapi',
  UBER = 'uber',
  BOLT = 'bolt',
  IN_HOUSE = 'in_house',
  SELLER = 'seller',
}
export interface TrackingEvent {
  event: string;
  timestamp: Date;
  location: string | null;
  provider: string | null;
}
export interface PodArtifact {
  type: 'photo' | 'signature' | 'gps';
  url: string | null;
  coordinates: {
    lat: number;
    lng: number;
  } | null;
  capturedAt: Date;
}
export class LogisticsBooking extends BaseSchema {
  bookingRef!: string;
  orderId!: string;
  orderRef!: string;
  groupKey!: string | null;
  provider!: LogisticsProvider;
  status!: BookingStatus;
  quoteId!: string | null;
  courierId!: string | null;
  serviceCode!: string | null;
  shipmentReference!: string | null;
  bookingUncertain!: boolean;
  externalBookingId!: string | null;
  trackingUrl!: string | null;
  pickupAddress!: {
    street1: string;
    city: string;
    state: string;
    country: string;
    lat: number | null;
    lng: number | null;
  } | null;
  dropoffAddress!: {
    street1: string;
    city: string;
    state: string;
    country: string;
    lat: number | null;
    lng: number | null;
  } | null;
  trackingEvents!: TrackingEvent[];
  podArtifacts!: PodArtifact[];
  quotedFeeKobo!: number;
  cancelReason!: string | null;
  retryCount!: number;
}
