import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import {
  LogisticsBooking,
  LogisticsProvider,
  BookingStatus,
} from './schemas/logistics-booking.schema';
import { LogisticsRepository } from './logistics.repository';
import { LogisticsQuoteDto, CoverageCheckDto, BookCourierDto, PodUploadDto } from './dto/quote.dto';
import { ConfigService } from '@config/config.service';
import { EmailService } from '@email/email.service';
import { Order } from '@orders/schemas/order.schema';

class StackApiResponseError extends Error {
  constructor(
    readonly statusCode: number,
    readonly providerCode: string,
  ) {
    super('StackAPI logistics request failed');
  }
}

@Injectable()
export class LogisticsService {
  private readonly logger = new Logger(LogisticsService.name);

  constructor(
    private readonly repo: LogisticsRepository,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  private async stackApiRequest(path: string, init: RequestInit = {}): Promise<any> {
    const { apiKey, publicKey } = this.configService.stackApi;
    if (!apiKey || !publicKey) {
      throw new ServiceUnavailableException('StackAPI Logistics is not configured');
    }
    const baseUrl = this.configService.stackApiLogistics.baseUrl.replace(/\/$/, '');
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/${path.replace(/^\//, '')}`, {
        ...init,
        headers: {
          'X-API-Key': apiKey,
          'X-Public-Key': publicKey,
          'Content-Type': 'application/json',
          ...init.headers,
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      this.logger.warn(`StackAPI Logistics request failed before a response (${path}).`);
      throw new ServiceUnavailableException('Courier service is temporarily unavailable');
    }
    let payload: any = {};
    try {
      payload = await response.json();
    } catch {
      // Keep provider response parsing failures generic; raw provider data may contain PII.
    }
    if (!response.ok) {
      const code = typeof payload?.code === 'string' ? payload.code : 'PROVIDER_ERROR';
      this.logger.warn(`StackAPI Logistics returned HTTP ${response.status} (${code}).`);
      throw new StackApiResponseError(response.status, code);
    }
    return payload;
  }

  async getCourierCategories(): Promise<unknown> {
    return this.stackApiRequest('categories', { method: 'GET' });
  }

  private toDto(b: LogisticsBooking, accountType?: string): object {
    const id = (b as unknown as { _id: { toString(): string } })._id.toString();
    const result: Record<string, unknown> = {
      id,
      bookingRef: b.bookingRef,
      orderId: b.orderId,
      orderRef: b.orderRef,
      groupKey: b.groupKey,
      provider: b.provider,
      status: b.status,
      quoteId: b.quoteId,
      courierId: b.courierId,
      serviceCode: b.serviceCode,
      shipmentReference: b.shipmentReference,
      bookingUncertain: b.bookingUncertain,
      externalBookingId: b.externalBookingId,
      trackingUrl: b.trackingUrl,
      pickupAddress: b.pickupAddress,
      dropoffAddress: b.dropoffAddress,
      trackingEvents: b.trackingEvents,
      podArtifacts: b.podArtifacts,
      quotedFeeKobo: b.quotedFeeKobo,
      cancelReason: b.cancelReason,
      retryCount: b.retryCount,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    };
    // Seller pickup locations are private business data; buyers only need their delivery tracking.
    if (accountType === 'buyer') delete result.pickupAddress;
    return result;
  }

  async getQuote(dto: LogisticsQuoteDto): Promise<unknown> {
    const [sender, receiver] = await Promise.all([
      this.stackApiRequest('addresses', {
        method: 'POST',
        body: JSON.stringify(dto.sender),
      }),
      this.stackApiRequest('addresses', {
        method: 'POST',
        body: JSON.stringify(dto.receiver),
      }),
    ]);
    const senderId = sender?.data?.id ?? sender?.id;
    const receiverId = receiver?.data?.id ?? receiver?.id;
    if (!senderId || !receiverId) {
      throw new ServiceUnavailableException('Courier service returned an invalid address response');
    }
    return this.stackApiRequest('quotes', {
      method: 'POST',
      body: JSON.stringify({
        sender_address_id: senderId,
        receiver_address_id: receiverId,
        pickup_date: dto.pickupDate ?? new Date().toISOString().slice(0, 10),
        category_id: dto.categoryId,
        items: dto.items,
        dimension: {
          length_cm: dto.lengthCm,
          width_cm: dto.widthCm,
          height_cm: dto.heightCm,
        },
      }),
    });
  }

  checkCoverage(dto: CoverageCheckDto): object {
    const covered = dto.city.toLowerCase().includes('lagos');
    return {
      city: dto.city,
      address: dto.address,
      covered,
      note: covered
        ? 'Lagos delivery is supported in V1'
        : 'Only Lagos delivery is supported in V1',
    };
  }

  async bookCourier(dto: BookCourierDto): Promise<object> {
    const existing = await this.repo.findByOrderAndGroup(dto.orderId, dto.groupKey);
    if (existing?.externalBookingId) return this.toDto(existing);
    if (existing?.bookingUncertain) return this.reconcileBooking(existing);

    const booking =
      existing ??
      (await this.repo.create({
        orderId: dto.orderId,
        orderRef: dto.orderRef,
        groupKey: dto.groupKey,
        provider: LogisticsProvider.STACKAPI,
        status: BookingStatus.PENDING,
        quoteId: dto.quoteId,
        courierId: dto.courierId,
        serviceCode: dto.serviceCode,
        quotedFeeKobo: dto.quotedFeeKobo ?? 0,
      } as Partial<LogisticsBooking>));
    if (!booking.shipmentReference) {
      const updated = await this.repo.update(String((booking as any)._id), {
        shipmentReference: booking.bookingRef,
      } as Partial<LogisticsBooking>);
      if (updated) Object.assign(booking, updated);
    }

    try {
      const result = await this.stackApiRequest('shipments', {
        method: 'POST',
        body: JSON.stringify({
          quote_id: dto.quoteId,
          courier_id: dto.courierId,
          service_code: dto.serviceCode,
          reference: booking.shipmentReference ?? booking.bookingRef,
        }),
      });
      return this.saveProviderBooking(booking, result);
    } catch (error) {
      const uncertain = !(
        error instanceof StackApiResponseError &&
        error.statusCode >= 400 &&
        error.statusCode < 500
      );
      const updated = await this.repo.update(String((booking as any)._id), {
        status: uncertain ? BookingStatus.PENDING : BookingStatus.FAILED,
        bookingUncertain: uncertain,
      } as Partial<LogisticsBooking>);
      await this.alertCadna(
        booking.orderRef,
        error instanceof StackApiResponseError ? error.providerCode : 'PROVIDER_UNCONFIRMED',
      );
      if (!updated) throw new ServiceUnavailableException('Courier booking needs CADNA review');
      return this.toDto(updated);
    }
  }

  async bookPaidOrder(order: Order): Promise<void> {
    const orderId = String((order as any).id ?? (order as any)._id ?? '');
    if (!orderId) return;
    for (const delivery of order.pricing?.deliveryBreakdown ?? []) {
      if (!delivery.quoteId || !delivery.courierId || !delivery.serviceCode) continue;
      try {
        await this.bookCourier({
          orderId,
          orderRef: order.orderRef,
          groupKey: delivery.groupKey,
          quoteId: delivery.quoteId,
          courierId: delivery.courierId,
          serviceCode: delivery.serviceCode,
          quotedFeeKobo: Math.round((delivery.fee?.amount ?? 0) * 100),
        });
      } catch {
        // Payment is already confirmed. Keep fulfillment issues out of the payment path.
        await this.alertCadna(order.orderRef, 'BOOKING_RECORD_ERROR');
      }
    }
  }

  private async saveProviderBooking(booking: LogisticsBooking, result: any): Promise<object> {
    const data = result?.data ?? result;
    if (!data?.id) {
      const updated = await this.repo.update(String((booking as any)._id), {
        bookingUncertain: true,
        status: BookingStatus.PENDING,
      } as Partial<LogisticsBooking>);
      await this.alertCadna(booking.orderRef, 'BOOKING_RESPONSE_MISSING_ID');
      return this.toDto(updated ?? booking);
    }
    const nextStatus = this.mapProviderStatus(data?.status) ?? BookingStatus.PENDING;
    const updated = await this.repo.update(String((booking as any)._id), {
      externalBookingId: String(data.id),
      trackingUrl: data?.tracking_url ? String(data.tracking_url) : null,
      status: nextStatus,
      bookingUncertain: false,
    } as Partial<LogisticsBooking>);
    return this.toDto(updated ?? booking);
  }

  private mapProviderStatus(value: unknown): BookingStatus | null {
    switch (value) {
      case 'completed':
        return BookingStatus.DELIVERED;
      case 'cancelled':
        return BookingStatus.CANCELLED;
      case 'picked_up':
        return BookingStatus.PICKED_UP;
      case 'in_transit':
        return BookingStatus.IN_TRANSIT;
      case 'failed':
        return BookingStatus.FAILED;
      case 'confirmed':
        return BookingStatus.CONFIRMED;
      default:
        return null;
    }
  }

  private async reconcileBooking(booking: LogisticsBooking): Promise<object> {
    const reference = booking.shipmentReference ?? booking.bookingRef;
    try {
      const result = await this.stackApiRequest(`shipments/${encodeURIComponent(reference)}`, {
        method: 'GET',
      });
      return this.saveProviderBooking(booking, result);
    } catch {
      // A timed-out booking can still have succeeded upstream. Do not issue a second booking.
      return this.toDto(booking);
    }
  }

  private async alertCadna(orderRef: string, code: string): Promise<void> {
    try {
      await this.emailService.sendNotificationEmail({
        to: this.configService.stackApiLogistics.alertEmail,
        title: 'Courier booking needs attention',
        body: `Courier booking for order ${orderRef} was not confirmed (${code}). The paid order remains active; review the booking in CADNA admin.`,
      });
    } catch {
      this.logger.error(
        `Could not email CADNA about an uncertain courier booking for ${orderRef}.`,
      );
    }
  }

  async getBooking(id: string, userId?: string, accountType?: string): Promise<object> {
    const b =
      userId && accountType && accountType !== 'admin'
        ? await this.repo.findByIdForUser(id, userId, accountType)
        : await this.repo.findById(id);
    if (!b) throw new NotFoundException('Booking not found');
    return this.toDto(b, accountType);
  }

  async cancelBooking(id: string, reason?: string): Promise<object> {
    const b = await this.repo.findById(id);
    if (!b) throw new NotFoundException('Booking not found');
    if (b.externalBookingId) {
      await this.stackApiRequest(`shipments/${encodeURIComponent(b.externalBookingId)}/cancel`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
    }
    const updated = await this.repo.update(id, {
      status: BookingStatus.CANCELLED,
      cancelReason: reason ?? null,
    } as Partial<LogisticsBooking>);
    if (!updated) throw new NotFoundException('Booking not found after update');
    return this.toDto(updated);
  }

  async retryBooking(id: string): Promise<object> {
    const b = await this.repo.findById(id);
    if (!b) throw new NotFoundException('Booking not found');
    if (b.bookingUncertain) return this.reconcileBooking(b);
    if (
      b.provider === LogisticsProvider.STACKAPI &&
      b.quoteId &&
      b.courierId &&
      b.serviceCode &&
      b.groupKey
    ) {
      return this.bookCourier({
        orderId: b.orderId,
        orderRef: b.orderRef,
        groupKey: b.groupKey,
        quoteId: b.quoteId,
        courierId: b.courierId,
        serviceCode: b.serviceCode,
        quotedFeeKobo: b.quotedFeeKobo,
      });
    }
    const updated = await this.repo.update(id, {
      status: BookingStatus.PENDING,
      retryCount: (b.retryCount ?? 0) + 1,
    } as Partial<LogisticsBooking>);
    if (!updated) throw new NotFoundException('Booking not found after update');
    return this.toDto(updated);
  }

  async getTracking(bookingId: string, userId?: string, accountType?: string): Promise<object> {
    let b =
      userId && accountType && accountType !== 'admin'
        ? await this.repo.findByIdForUser(bookingId, userId, accountType)
        : await this.repo.findById(bookingId);
    if (!b) throw new NotFoundException('Booking not found');
    if (b.provider === LogisticsProvider.STACKAPI && b.externalBookingId) {
      try {
        const providerResult = await this.stackApiRequest(
          `shipments/${encodeURIComponent(b.externalBookingId)}`,
          { method: 'GET' },
        );
        const providerData = providerResult?.data ?? providerResult;
        const status = this.mapProviderStatus(providerData?.status);
        const updated = await this.repo.update(String((b as any)._id), {
          ...(status ? { status } : {}),
          trackingUrl:
            typeof providerData?.tracking_url === 'string'
              ? providerData.tracking_url
              : b.trackingUrl,
        } as Partial<LogisticsBooking>);
        if (updated) b = updated;
      } catch {
        // Return the most recent persisted state when StackAPI tracking is temporarily unavailable.
      }
    }
    return {
      bookingId,
      bookingRef: b.bookingRef,
      status: b.status,
      trackingUrl: b.trackingUrl,
      events: b.trackingEvents,
    };
  }

  async uploadPod(dto: PodUploadDto): Promise<object> {
    const b = await this.repo.findById(dto.bookingId);
    if (!b) throw new NotFoundException('Booking not found');
    const artifact: LogisticsBooking['podArtifacts'][0] = {
      type: dto.type as 'photo' | 'signature' | 'gps',
      url: dto.url ?? null,
      coordinates: null,
      capturedAt: new Date(),
    };
    await this.repo.pushPodArtifact(dto.bookingId, artifact);
    return { bookingId: dto.bookingId, artifact };
  }

  handleUberWebhook(payload: unknown): object {
    return { received: true, provider: 'uber', payload };
  }

  handleBoltWebhook(payload: unknown): object {
    return { received: true, provider: 'bolt', payload };
  }

  async pickupReady(orderId: string, note?: string): Promise<object> {
    return { orderId, action: 'ready', note: note ?? null, timestamp: new Date() };
  }

  async pickupVerify(orderId: string): Promise<object> {
    return { orderId, action: 'verify', verified: true, timestamp: new Date() };
  }

  async pickupComplete(orderId: string): Promise<object> {
    return { orderId, action: 'complete', completed: true, timestamp: new Date() };
  }

  async pickupFail(orderId: string, note?: string): Promise<object> {
    return { orderId, action: 'fail', note: note ?? null, timestamp: new Date() };
  }
}
