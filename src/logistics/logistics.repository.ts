import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '@database/prisma.service';
import { createPublicId } from '@database/id.util';
import { LogisticsBooking, BookingStatus } from './schemas/logistics-booking.schema';

@Injectable()
export class LogisticsRepository {
  constructor(private readonly prisma: PrismaService) {}
  private generateRef(): string {
    return 'LB-' + randomBytes(4).toString('hex').toUpperCase();
  }
  private legacy(row: any): LogisticsBooking | null {
    return row ? ({ ...row, _id: row.id } as unknown as LogisticsBooking) : null;
  }

  async create(data: Partial<LogisticsBooking>): Promise<LogisticsBooking> {
    const value = data as any;
    return this.legacy(
      await this.prisma.logisticsBooking.create({
        data: {
          id: createPublicId(),
          bookingRef: this.generateRef(),
          orderId: value.orderId,
          orderRef: value.orderRef,
          groupKey: value.groupKey ?? null,
          provider: value.provider,
          status: value.status ?? BookingStatus.PENDING,
          quoteId: value.quoteId ?? null,
          courierId: value.courierId ?? null,
          serviceCode: value.serviceCode ?? null,
          shipmentReference: value.shipmentReference ?? null,
          bookingUncertain: value.bookingUncertain ?? false,
          externalBookingId: value.externalBookingId ?? null,
          trackingUrl: value.trackingUrl ?? null,
          pickupAddress: value.pickupAddress ?? undefined,
          dropoffAddress: value.dropoffAddress ?? undefined,
          trackingEvents: value.trackingEvents ?? [],
          podArtifacts: value.podArtifacts ?? [],
          quotedFeeKobo: value.quotedFeeKobo ?? 0,
          cancelReason: value.cancelReason ?? null,
          retryCount: value.retryCount ?? 0,
        },
      }),
    )!;
  }
  async findById(id: string): Promise<LogisticsBooking | null> {
    return this.legacy(
      await this.prisma.logisticsBooking.findFirst({ where: { id, deletedAt: null } }),
    );
  }
  async findByIdForUser(
    id: string,
    userId: string,
    accountType: string,
  ): Promise<LogisticsBooking | null> {
    const booking = await this.prisma.logisticsBooking.findFirst({
      where: { id, deletedAt: null },
      include: { order: { select: { userId: true, items: true } } },
    });
    if (!booking) return null;
    if (accountType === 'buyer' && booking.order?.userId === userId) return this.legacy(booking);
    if (accountType === 'seller') {
      const seller = await this.prisma.seller.findFirst({
        where: { ownerId: userId, deletedAt: null },
        select: { id: true },
      });
      const sellerId = seller?.id;
      const orderItems = Array.isArray(booking.order?.items) ? booking.order.items : [];
      const legacyBookingMatchesOnlySeller =
        orderItems.length > 0 && orderItems.every((item: any) => item?.sellerId === sellerId);
      const belongsToSeller = Boolean(
        sellerId &&
        (booking.groupKey?.startsWith(`${sellerId}:`) ||
          (!booking.groupKey && legacyBookingMatchesOnlySeller)),
      );
      if (belongsToSeller) return this.legacy(booking);
    }
    return null;
  }
  async findByRef(ref: string): Promise<LogisticsBooking | null> {
    return this.legacy(
      await this.prisma.logisticsBooking.findFirst({ where: { bookingRef: ref, deletedAt: null } }),
    );
  }
  async findByOrderId(orderId: string): Promise<LogisticsBooking | null> {
    return this.legacy(
      await this.prisma.logisticsBooking.findFirst({
        where: { orderId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }
  async findByOrderAndGroup(orderId: string, groupKey: string): Promise<LogisticsBooking | null> {
    return this.legacy(
      await this.prisma.logisticsBooking.findFirst({
        where: { orderId, groupKey, deletedAt: null },
      }),
    );
  }
  async update(id: string, data: Partial<LogisticsBooking>): Promise<LogisticsBooking | null> {
    try {
      return this.legacy(
        await this.prisma.logisticsBooking.update({ where: { id }, data: data as any }),
      );
    } catch {
      return null;
    }
  }
  private async appendJson(id: string, field: 'trackingEvents' | 'podArtifacts', item: unknown) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM logistics_bookings WHERE id = ${id} FOR UPDATE`;
      const current = await tx.logisticsBooking.findUnique({ where: { id } });
      if (!current) return;
      const values = Array.isArray(current[field]) ? (current[field] as any[]) : [];
      await tx.logisticsBooking.update({
        where: { id },
        data: { [field]: [...values, item] } as any,
      });
    });
  }
  async pushTrackingEvent(id: string, event: LogisticsBooking['trackingEvents'][0]): Promise<void> {
    await this.appendJson(id, 'trackingEvents', event);
  }
  async pushPodArtifact(id: string, artifact: LogisticsBooking['podArtifacts'][0]): Promise<void> {
    await this.appendJson(id, 'podArtifacts', artifact);
  }
  async updateStatus(id: string, status: BookingStatus): Promise<void> {
    await this.prisma.logisticsBooking.updateMany({ where: { id }, data: { status } });
  }
}
