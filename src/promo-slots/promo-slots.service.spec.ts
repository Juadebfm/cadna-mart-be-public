import { NotFoundException } from '@nestjs/common';
import { PromoSlotsRepository } from './promo-slots.repository';
import { PromoSlotsService } from './promo-slots.service';

describe('PromoSlotsService', () => {
  const booking = {
    _id: { toString: () => 'booking-1' },
    sellerId: { toString: () => 'seller-1' },
    slotId: 'slot-1',
    durationTierId: 'tier-1',
    productId: 'product-1',
    amountPaidNGN: 5000,
    status: 'pending_payment',
    paymentStatus: 'unpaid',
    paystackAuthUrl: null,
    activatedAt: null,
    expiresAt: null,
    suspendReason: null,
    impressions: 0,
    clicks: 0,
    orders: 0,
    createdAt: new Date('2026-01-01'),
  };

  const createService = () => {
    const repository = {
      findBookingById: jest.fn().mockResolvedValue(booking),
    } as unknown as PromoSlotsRepository;
    return new PromoSlotsService(repository);
  };

  it('returns a booking to its owner', async () => {
    const service = createService();

    await expect(service.findBookingById('booking-1', 'seller-1')).resolves.toMatchObject({
      id: 'booking-1',
      sellerId: booking.sellerId,
    });
  });

  it('does not disclose a booking to another seller', async () => {
    const service = createService();

    await expect(service.findBookingById('booking-1', 'seller-2')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
