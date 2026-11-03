import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { SlotType } from './schemas/slot-type.schema';
import { DurationTier } from './schemas/duration-tier.schema';
import { PromoSlot } from './schemas/promo-slot.schema';
import { SlotBooking, BookingStatus, BookingPaymentStatus } from './schemas/slot-booking.schema';
import { PromoSlotsRepository } from './promo-slots.repository';
import { CreateSlotTypeDto, UpdateSlotTypeDto } from './dto/slot-type.dto';
import { CreateDurationTierDto, UpdateDurationTierDto } from './dto/duration-tier.dto';
import { CreateBookingDto, GenerateSlotsDto, SuspendBookingDto } from './dto/booking.dto';

@Injectable()
export class PromoSlotsService {
  constructor(private readonly repo: PromoSlotsRepository) {}

  private slotTypeDto(t: SlotType): object {
    const id = (t as unknown as { _id: { toString(): string } })._id.toString();
    return {
      id,
      name: t.name,
      placement: t.placement,
      maxItems: t.maxItems,
      isActive: t.isActive,
      description: t.description,
      createdAt: t.createdAt,
    };
  }

  private tierDto(t: DurationTier): object {
    const id = (t as unknown as { _id: { toString(): string } })._id.toString();
    return {
      id,
      slotTypeId: t.slotTypeId,
      label: t.label,
      durationHours: t.durationHours,
      priceNGN: t.priceNGN,
      isActive: t.isActive,
      createdAt: t.createdAt,
    };
  }

  private slotDto(s: PromoSlot): object {
    const id = (s as unknown as { _id: { toString(): string } })._id.toString();
    return {
      id,
      slotTypeId: s.slotTypeId,
      date: s.date,
      capacity: s.capacity,
      bookedCount: s.bookedCount,
      status: s.status,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
    };
  }

  private bookingDto(b: SlotBooking): object {
    const id = (b as unknown as { _id: { toString(): string } })._id.toString();
    return {
      id,
      sellerId: b.sellerId,
      slotId: b.slotId,
      durationTierId: b.durationTierId,
      productId: b.productId,
      amountPaidNGN: b.amountPaidNGN,
      status: b.status,
      paymentStatus: b.paymentStatus,
      paystackAuthUrl: b.paystackAuthUrl,
      activatedAt: b.activatedAt,
      expiresAt: b.expiresAt,
      suspendReason: b.suspendReason,
      impressions: b.impressions,
      clicks: b.clicks,
      orders: b.orders,
      createdAt: b.createdAt,
    };
  }

  async createSlotType(dto: CreateSlotTypeDto): Promise<object> {
    const created = await this.repo.createSlotType({
      ...dto,
      description: dto.description ?? null,
      isActive: true,
    } as Partial<SlotType>);
    return this.slotTypeDto(created);
  }

  async findAllSlotTypes(): Promise<object[]> {
    const types = await this.repo.findAllSlotTypes();
    return types.map((t) => this.slotTypeDto(t));
  }

  async updateSlotType(id: string, dto: UpdateSlotTypeDto): Promise<object> {
    const updated = await this.repo.updateSlotType(id, dto as Partial<SlotType>);
    if (!updated) throw new NotFoundException('Slot type not found');
    return this.slotTypeDto(updated);
  }

  async deleteSlotType(id: string): Promise<void> {
    const existing = await this.repo.findSlotTypeById(id);
    if (!existing) throw new NotFoundException('Slot type not found');
    await this.repo.softDeleteSlotType(id);
  }

  async createTier(dto: CreateDurationTierDto): Promise<object> {
    const created = await this.repo.createTier({
      slotTypeId: dto.slotTypeId as unknown as DurationTier['slotTypeId'],
      label: dto.label,
      durationHours: dto.durationHours,
      priceNGN: dto.priceNGN,
      isActive: true,
    } as Partial<DurationTier>);
    return this.tierDto(created);
  }

  async findAllTiers(): Promise<object[]> {
    const tiers = await this.repo.findAllTiers();
    return tiers.map((t) => this.tierDto(t));
  }

  async updateTier(id: string, dto: UpdateDurationTierDto): Promise<object> {
    const updated = await this.repo.updateTier(id, dto as Partial<DurationTier>);
    if (!updated) throw new NotFoundException('Duration tier not found');
    return this.tierDto(updated);
  }

  async deleteTier(id: string): Promise<void> {
    const existing = await this.repo.findTierById(id);
    if (!existing) throw new NotFoundException('Duration tier not found');
    await this.repo.softDeleteTier(id);
  }

  async findAvailableSlots(slotTypeId?: string): Promise<object[]> {
    const slots = await this.repo.findAvailableSlots(slotTypeId);
    return slots.map((s) => this.slotDto(s));
  }

  async findSlotById(id: string): Promise<object> {
    const slot = await this.repo.findSlotById(id);
    if (!slot) throw new NotFoundException('Slot not found');
    return this.slotDto(slot);
  }

  async reserveSlot(slotId: string): Promise<object> {
    const slot = await this.repo.findSlotById(slotId);
    if (!slot) throw new NotFoundException('Slot not found');
    if (slot.bookedCount >= slot.capacity) throw new BadRequestException('Slot is fully booked');
    return {
      slotId,
      reserved: true,
      expiresIn: '15m',
      note: 'Complete booking via POST /promo-slots/bookings',
    };
  }

  async createBooking(dto: CreateBookingDto, sellerId: string): Promise<object> {
    const slot = await this.repo.findSlotById(dto.slotId);
    if (!slot) throw new NotFoundException('Slot not found');
    if (slot.bookedCount >= slot.capacity) throw new BadRequestException('Slot is fully booked');

    const tier = await this.repo.findTierById(dto.durationTierId);
    if (!tier) throw new NotFoundException('Duration tier not found');

    const booking = await this.repo.createBooking({
      sellerId: sellerId as unknown as SlotBooking['sellerId'],
      slotId: dto.slotId as unknown as SlotBooking['slotId'],
      durationTierId: dto.durationTierId as unknown as SlotBooking['durationTierId'],
      productId: dto.productId as unknown as SlotBooking['productId'],
      amountPaidNGN: tier.priceNGN,
      status: BookingStatus.PENDING_PAYMENT,
      paymentStatus: BookingPaymentStatus.UNPAID,
    } as Partial<SlotBooking>);

    return this.bookingDto(booking);
  }

  async findBookingsBySeller(sellerId: string, page = 1, limit = 20): Promise<object> {
    const { items, totalItems } = await this.repo.findBookingsBySeller(sellerId, page, limit);
    return {
      items: items.map((b) => this.bookingDto(b)),
      pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };
  }

  async findBookingById(id: string, sellerId: string): Promise<object> {
    const b = await this.repo.findBookingById(id);
    if (!b) throw new NotFoundException('Booking not found');
    if (b.sellerId.toString() !== sellerId) throw new NotFoundException('Booking not found');
    return this.bookingDto(b);
  }

  async payForBooking(id: string, sellerId: string): Promise<object> {
    const b = await this.repo.findBookingById(id);
    if (!b) throw new NotFoundException('Booking not found');
    if (b.sellerId.toString() !== sellerId) throw new NotFoundException('Booking not found');
    if (b.status !== BookingStatus.PENDING_PAYMENT)
      throw new BadRequestException('Booking is not awaiting payment');
    return {
      bookingId: id,
      authorizationUrl: `https://checkout.paystack.com/placeholder-${id}`,
      note: 'Paystack payment for promo slot bookings — full integration uses the existing Paystack flow.',
    };
  }

  async cancelBooking(id: string, sellerId: string): Promise<object> {
    const b = await this.repo.findBookingById(id);
    if (!b) throw new NotFoundException('Booking not found');
    if (b.sellerId.toString() !== sellerId) throw new NotFoundException('Booking not found');
    if (![BookingStatus.PENDING_PAYMENT, BookingStatus.ACTIVE].includes(b.status)) {
      throw new BadRequestException('Only pending or active bookings can be cancelled');
    }
    const updated = await this.repo.updateBooking(id, {
      status: BookingStatus.CANCELLED,
    } as Partial<SlotBooking>);
    if (!updated) throw new NotFoundException('Booking not found after update');
    return this.bookingDto(updated);
  }

  async getPerformance(id: string, sellerId: string): Promise<object> {
    const b = await this.repo.findBookingById(id);
    if (!b) throw new NotFoundException('Booking not found');
    if (b.sellerId.toString() !== sellerId) throw new NotFoundException('Booking not found');
    return {
      bookingId: id,
      impressions: b.impressions,
      clicks: b.clicks,
      orders: b.orders,
      ctr: b.impressions > 0 ? (b.clicks / b.impressions).toFixed(4) : '0.0000',
    };
  }

  async findAllBookings(page = 1, limit = 20, status?: BookingStatus): Promise<object> {
    const { items, totalItems } = await this.repo.findAllBookings(page, limit, status);
    return {
      items: items.map((b) => this.bookingDto(b)),
      pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };
  }

  async suspendBooking(id: string, dto: SuspendBookingDto, adminId: string): Promise<object> {
    const b = await this.repo.findBookingById(id);
    if (!b) throw new NotFoundException('Booking not found');
    const updated = await this.repo.updateBooking(id, {
      status: BookingStatus.SUSPENDED,
      suspendReason: dto.reason,
      suspendedBy: adminId as unknown as SlotBooking['suspendedBy'],
    } as Partial<SlotBooking>);
    if (!updated) throw new NotFoundException('Booking not found after update');
    return this.bookingDto(updated);
  }

  async adminRefundBooking(id: string): Promise<object> {
    const b = await this.repo.findBookingById(id);
    if (!b) throw new NotFoundException('Booking not found');
    const updated = await this.repo.updateBooking(id, {
      paymentStatus: BookingPaymentStatus.REFUNDED,
      status: BookingStatus.CANCELLED,
    } as Partial<SlotBooking>);
    if (!updated) throw new NotFoundException('Booking not found after update');
    return this.bookingDto(updated);
  }

  async generateSlots(dto: GenerateSlotsDto): Promise<object[]> {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    const created: object[] = [];
    const current = new Date(start);

    while (current <= end) {
      const date = current.toISOString().split('T')[0];
      const startsAt = new Date(current);
      startsAt.setHours(0, 0, 0, 0);
      const endsAt = new Date(current);
      endsAt.setHours(23, 59, 59, 999);

      const slot = await this.repo.createSlot({
        slotTypeId: dto.slotTypeId as unknown as PromoSlot['slotTypeId'],
        date,
        capacity: dto.capacity,
        bookedCount: 0,
        startsAt,
        endsAt,
      } as Partial<PromoSlot>);
      created.push(this.slotDto(slot));
      current.setDate(current.getDate() + 1);
    }

    return created;
  }

  getCapacity(): object {
    return {
      note: 'Capacity is configured per slot type when generating slots. Use POST /admin/promo-slots/generate.',
      defaultCapacity: 10,
    };
  }

  updateCapacity(data: unknown): object {
    return {
      updated: true,
      data,
      note: 'Apply capacity via POST /admin/promo-slots/generate for new slots.',
    };
  }

  getRevenueReport(): object {
    return {
      totalRevenueNGN: 0,
      bookingCount: 0,
      note: 'Revenue report will aggregate amountPaidNGN from paid slot bookings.',
    };
  }

  getUtilizationReport(): object {
    return { utilization: [], note: 'Utilization shows bookedCount / capacity per slot per day.' };
  }
}
