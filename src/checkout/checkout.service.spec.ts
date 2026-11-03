import { BadRequestException } from '@nestjs/common';
import { CheckoutService } from './checkout.service';

describe('CheckoutService configured delivery pricing', () => {
  const prisma = {
    deliveryZone: { findMany: jest.fn() },
    seller: { findFirst: jest.fn() },
  };
  const logistics = { getQuote: jest.fn() };
  let service: CheckoutService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CheckoutService(prisma as any, {} as any, {} as any, logistics as any);
  });

  it('groups items by seller and method, then prices weight against the matching LGA zone', async () => {
    prisma.deliveryZone.findMany.mockResolvedValue([
      {
        id: 'zone-lagos',
        lgaNames: ['Ikeja'],
        rates: [{ id: 'rate-1', minWeightGrams: 0, maxWeightGrams: 1000, amountKobo: 275000 }],
      },
    ]);

    const result = await (service as any).resolveDeliveryBreakdown(
      {
        items: [
          {
            quantity: 2,
            product: {
              sellerId: 'seller-1',
              deliveryMethod: 'seller_owned_courier',
              shippingWeightGrams: 200,
            },
          },
          {
            quantity: 1,
            product: {
              sellerId: 'seller-1',
              deliveryMethod: 'seller_owned_courier',
              shippingWeightGrams: 300,
            },
          },
        ],
      },
      { state: 'Lagos', lga: '  ikeja ' },
    );

    expect(result).toEqual([
      expect.objectContaining({
        sellerId: 'seller-1',
        method: 'seller_owned_courier',
        weightGrams: 700,
        fee: { amount: 2750, currency: 'NGN', formatted: '₦2,750' },
        status: 'priced',
        rateId: 'rate-1',
      }),
    ]);
  });

  it('keeps each seller delivery as a separate charge', async () => {
    prisma.deliveryZone.findMany.mockResolvedValue([
      {
        id: 'zone-lagos',
        lgaNames: ['Ikeja'],
        rates: [{ id: 'rate-1', minWeightGrams: 0, maxWeightGrams: null, amountKobo: 100000 }],
      },
    ]);

    const result = await (service as any).resolveDeliveryBreakdown(
      {
        items: [
          {
            quantity: 1,
            product: {
              sellerId: 'seller-1',
              deliveryMethod: 'seller_owned_courier',
              shippingWeightGrams: 100,
            },
          },
          {
            quantity: 1,
            product: {
              sellerId: 'seller-2',
              deliveryMethod: 'seller_owned_courier',
              shippingWeightGrams: 100,
            },
          },
        ],
      },
      { state: 'Lagos', lga: 'Ikeja' },
      'buyer@example.test',
    );

    expect(result).toHaveLength(2);
    expect(result.map((delivery: any) => delivery.sellerId)).toEqual(['seller-1', 'seller-2']);
  });

  it('does not quote a StackAPI courier when package details are missing', async () => {
    const result = await (service as any).resolveDeliveryBreakdown(
      {
        items: [
          {
            quantity: 1,
            product: {
              sellerId: 'seller-1',
              deliveryMethod: 'cadna_logistics',
              shippingWeightGrams: 500,
            },
          },
        ],
      },
      { state: 'Lagos', lga: 'Ikeja' },
      'buyer@example.test',
    );

    expect(result[0]).toMatchObject({ status: 'unavailable', reason: 'missing_parcel_details' });
    expect(prisma.deliveryZone.findMany).not.toHaveBeenCalled();
  });

  it('gets one StackAPI quote per seller and courier category using the largest parcel dimensions', async () => {
    prisma.seller.findFirst.mockResolvedValue({
      pickupAddressConfirmedAt: new Date(),
      pickupAddress: {
        recipientName: 'Seller',
        phoneNumber: '08000000000',
        street1: '1 Road',
        city: 'Lagos',
        state: 'Lagos',
      },
      owner: { email: 'seller@example.test' },
    });
    logistics.getQuote.mockResolvedValue({
      data: {
        id: 'quote-1',
        expires_at: '2099-01-01T00:00:00.000Z',
        couriers: [
          {
            courier_id: 'courier-1',
            courier_name: 'Courier',
            service_code: 'express',
            amount: '900',
            fee: '100',
            total: '1000',
          },
        ],
      },
    });
    const result = await (service as any).resolveDeliveryBreakdown(
      {
        items: [
          {
            quantity: 1,
            product: {
              id: 'p1',
              sellerId: 'seller-1',
              deliveryMethod: 'cadna_logistics',
              logisticsCategoryId: 10,
              shippingWeightGrams: 500,
              packageLengthCm: 20,
              packageWidthCm: 10,
              packageHeightCm: 5,
              price: { amount: 5000 },
              name: 'Item 1',
            },
          },
          {
            quantity: 2,
            product: {
              id: 'p2',
              sellerId: 'seller-1',
              deliveryMethod: 'cadna_logistics',
              logisticsCategoryId: 10,
              shippingWeightGrams: 250,
              packageLengthCm: 15,
              packageWidthCm: 12,
              packageHeightCm: 8,
              price: { amount: 2000 },
              name: 'Item 2',
            },
          },
        ],
      },
      {
        recipientName: 'Buyer',
        phoneNumber: '08000000001',
        street1: '2 Road',
        city: 'Ikeja',
        lga: 'Ikeja',
        state: 'Lagos',
      },
      'buyer@example.test',
    );

    expect(logistics.getQuote).toHaveBeenCalledTimes(1);
    expect(logistics.getQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: 10,
        lengthCm: 20,
        widthCm: 12,
        heightCm: 8,
        items: [
          expect.objectContaining({ name: 'Item 1', weight_kg: 0.5, quantity: 1 }),
          expect.objectContaining({ name: 'Item 2', weight_kg: 0.25, quantity: 2 }),
        ],
      }),
    );
    expect(result[0]).toMatchObject({
      groupKey: 'seller-1:cadna_logistics:10',
      quoteId: 'quote-1',
      status: 'priced',
      courierOptions: [{ courierId: 'courier-1', total: 1000 }],
    });
  });

  it('splits one seller order into one StackAPI quote per category', async () => {
    prisma.seller.findFirst.mockResolvedValue({
      pickupAddressConfirmedAt: new Date(),
      pickupAddress: {
        recipientName: 'Seller',
        phoneNumber: '08000000000',
        street1: '1 Road',
        city: 'Lagos',
        state: 'Lagos',
      },
      owner: { email: 'seller@example.test' },
    });
    logistics.getQuote
      .mockResolvedValueOnce({
        data: {
          id: 'quote-10',
          expires_at: '2099-01-01T00:00:00.000Z',
          couriers: [{ courier_id: 'c1', service_code: 'standard', total: '1000' }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'quote-20',
          expires_at: '2099-01-01T00:00:00.000Z',
          couriers: [{ courier_id: 'c2', service_code: 'standard', total: '1200' }],
        },
      });

    const result = await (service as any).resolveDeliveryBreakdown(
      {
        items: [
          {
            quantity: 1,
            product: {
              id: 'p1',
              sellerId: 'seller-1',
              deliveryMethod: 'cadna_logistics',
              logisticsCategoryId: 10,
              shippingWeightGrams: 500,
              packageLengthCm: 20,
              packageWidthCm: 10,
              packageHeightCm: 5,
              price: { amount: 5000 },
              name: 'Phone',
            },
          },
          {
            quantity: 1,
            product: {
              id: 'p2',
              sellerId: 'seller-1',
              deliveryMethod: 'cadna_logistics',
              logisticsCategoryId: 20,
              shippingWeightGrams: 800,
              packageLengthCm: 30,
              packageWidthCm: 20,
              packageHeightCm: 10,
              price: { amount: 7000 },
              name: 'Appliance',
            },
          },
        ],
      },
      {
        recipientName: 'Buyer',
        phoneNumber: '08000000001',
        street1: '2 Road',
        city: 'Ikeja',
        lga: 'Ikeja',
        state: 'Lagos',
      },
      'buyer@example.test',
    );

    expect(logistics.getQuote).toHaveBeenCalledTimes(2);
    expect(result.map((delivery: any) => delivery.groupKey)).toEqual([
      'seller-1:cadna_logistics:10',
      'seller-1:cadna_logistics:20',
    ]);
    expect(result.map((delivery: any) => delivery.quoteId)).toEqual(['quote-10', 'quote-20']);
  });

  it('does not price a seller delivery when its product weight is missing', async () => {
    const result = await (service as any).resolveDeliveryBreakdown(
      {
        items: [
          {
            quantity: 1,
            product: {
              sellerId: 'seller-1',
              deliveryMethod: 'seller_owned_courier',
              shippingWeightGrams: null,
            },
          },
        ],
      },
      { state: 'Lagos', lga: 'Ikeja' },
    );

    expect(result[0]).toMatchObject({ status: 'unavailable', reason: 'missing_weight' });
    expect(prisma.deliveryZone.findMany).not.toHaveBeenCalled();
    expect(() => (service as any).assertDeliveryAvailable(result)).toThrow(BadRequestException);
  });
});
