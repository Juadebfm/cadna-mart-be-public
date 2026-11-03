import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { createPublicId } from '@database/id.util';
import { SlotType } from './schemas/slot-type.schema';
import { DurationTier } from './schemas/duration-tier.schema';
import { PromoSlot, PromoSlotStatus } from './schemas/promo-slot.schema';
import { SlotBooking, BookingStatus } from './schemas/slot-booking.schema';

@Injectable()
export class PromoSlotsRepository {
  constructor(private readonly prisma: PrismaService) {}
  private legacy(row: any): any {
    return row ? { ...row, _id: row.id, suspendedBy: row.suspendedById } : null;
  }
  private id(value: unknown): string {
    return String(value);
  }

  async createSlotType(data: Partial<SlotType>): Promise<SlotType> {
    return this.legacy(
      await this.prisma.slotType.create({
        data: {
          id: createPublicId(),
          name: data.name!,
          placement: data.placement!,
          maxItems: data.maxItems!,
          isActive: data.isActive ?? true,
          description: data.description ?? null,
        },
      }),
    );
  }
  async findAllSlotTypes(): Promise<SlotType[]> {
    return (await this.prisma.slotType.findMany({ where: { deletedAt: null } })).map((row) =>
      this.legacy(row),
    );
  }
  async findSlotTypeById(id: string): Promise<SlotType | null> {
    return this.legacy(await this.prisma.slotType.findFirst({ where: { id, deletedAt: null } }));
  }
  async updateSlotType(id: string, data: Partial<SlotType>): Promise<SlotType | null> {
    try {
      return this.legacy(await this.prisma.slotType.update({ where: { id }, data: data as any }));
    } catch {
      return null;
    }
  }
  async softDeleteSlotType(id: string): Promise<void> {
    await this.prisma.slotType.updateMany({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async createTier(data: Partial<DurationTier>): Promise<DurationTier> {
    return this.legacy(
      await this.prisma.durationTier.create({
        data: {
          id: createPublicId(),
          slotTypeId: this.id(data.slotTypeId),
          label: data.label!,
          durationHours: data.durationHours!,
          priceNGN: data.priceNGN!,
          isActive: data.isActive ?? true,
        },
      }),
    );
  }
  async findAllTiers(slotTypeId?: string): Promise<DurationTier[]> {
    return (
      await this.prisma.durationTier.findMany({
        where: { deletedAt: null, ...(slotTypeId ? { slotTypeId } : {}) },
      })
    ).map((row) => this.legacy(row));
  }
  async findTierById(id: string): Promise<DurationTier | null> {
    return this.legacy(
      await this.prisma.durationTier.findFirst({ where: { id, deletedAt: null } }),
    );
  }
  async updateTier(id: string, data: Partial<DurationTier>): Promise<DurationTier | null> {
    try {
      return this.legacy(
        await this.prisma.durationTier.update({ where: { id }, data: data as any }),
      );
    } catch {
      return null;
    }
  }
  async softDeleteTier(id: string): Promise<void> {
    await this.prisma.durationTier.updateMany({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async findAvailableSlots(slotTypeId?: string): Promise<PromoSlot[]> {
    return (
      await this.prisma.promoSlot.findMany({
        where: {
          deletedAt: null,
          status: { not: PromoSlotStatus.FULL },
          ...(slotTypeId ? { slotTypeId } : {}),
        },
        orderBy: { startsAt: 'asc' },
      })
    ).map((row) => this.legacy(row));
  }
  async findSlotById(id: string): Promise<PromoSlot | null> {
    return this.legacy(await this.prisma.promoSlot.findFirst({ where: { id, deletedAt: null } }));
  }
  async createSlot(data: Partial<PromoSlot>): Promise<PromoSlot> {
    return this.legacy(
      await this.prisma.promoSlot.create({
        data: {
          id: createPublicId(),
          slotTypeId: this.id(data.slotTypeId),
          date: data.date!,
          capacity: data.capacity!,
          bookedCount: data.bookedCount ?? 0,
          status: data.status ?? PromoSlotStatus.AVAILABLE,
          startsAt: data.startsAt!,
          endsAt: data.endsAt!,
        },
      }),
    );
  }
  async incrementSlotBooked(id: string, capacity: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM promo_slots WHERE id = ${id} FOR UPDATE`;
      const slot = await tx.promoSlot.findFirst({ where: { id, deletedAt: null } });
      if (!slot || slot.bookedCount >= capacity) return;
      const bookedCount = slot.bookedCount + 1;
      await tx.promoSlot.update({
        where: { id },
        data: {
          bookedCount,
          status: bookedCount >= capacity ? PromoSlotStatus.FULL : PromoSlotStatus.PARTIALLY_BOOKED,
        },
      });
    });
  }

  async createBooking(data: Partial<SlotBooking>): Promise<SlotBooking> {
    const value = data as any;
    return this.legacy(
      await this.prisma.slotBooking.create({
        data: {
          id: createPublicId(),
          sellerId: this.id(value.sellerId),
          slotId: this.id(value.slotId),
          durationTierId: this.id(value.durationTierId),
          productId: this.id(value.productId),
          amountPaidNGN: value.amountPaidNGN!,
          status: value.status ?? BookingStatus.PENDING_PAYMENT,
          paymentStatus: value.paymentStatus ?? 'unpaid',
          paystackReference: value.paystackReference ?? null,
          paystackAuthUrl: value.paystackAuthUrl ?? null,
          activatedAt: value.activatedAt ?? null,
          expiresAt: value.expiresAt ?? null,
          suspendReason: value.suspendReason ?? null,
          suspendedById: value.suspendedBy ? this.id(value.suspendedBy) : null,
          impressions: value.impressions ?? 0,
          clicks: value.clicks ?? 0,
          orders: value.orders ?? 0,
        },
      }),
    );
  }
  async findBookingById(id: string): Promise<SlotBooking | null> {
    return this.legacy(await this.prisma.slotBooking.findFirst({ where: { id, deletedAt: null } }));
  }
  async findBookingsBySeller(
    sellerId: string,
    page: number,
    limit: number,
  ): Promise<{ items: SlotBooking[]; totalItems: number }> {
    const where = { sellerId, deletedAt: null };
    const [rows, totalItems] = await Promise.all([
      this.prisma.slotBooking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.slotBooking.count({ where }),
    ]);
    return { items: rows.map((row) => this.legacy(row)), totalItems };
  }
  async findAllBookings(
    page: number,
    limit: number,
    status?: BookingStatus,
  ): Promise<{ items: SlotBooking[]; totalItems: number }> {
    const where = { deletedAt: null, ...(status ? { status } : {}) };
    const [rows, totalItems] = await Promise.all([
      this.prisma.slotBooking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.slotBooking.count({ where }),
    ]);
    return { items: rows.map((row) => this.legacy(row)), totalItems };
  }
  async updateBooking(id: string, data: Partial<SlotBooking>): Promise<SlotBooking | null> {
    const mapped: any = { ...(data as any) };
    if ('suspendedBy' in mapped) {
      mapped.suspendedById = mapped.suspendedBy == null ? null : this.id(mapped.suspendedBy);
      delete mapped.suspendedBy;
    }
    try {
      return this.legacy(await this.prisma.slotBooking.update({ where: { id }, data: mapped }));
    } catch {
      return null;
    }
  }
}
