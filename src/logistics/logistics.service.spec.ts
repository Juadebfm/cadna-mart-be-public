import { LogisticsService } from './logistics.service';

describe('LogisticsService StackAPI logistics integration', () => {
  const repo = {
    create: jest.fn(),
    findByOrderAndGroup: jest.fn(),
    findById: jest.fn(),
    findByIdForUser: jest.fn(),
    update: jest.fn(),
  };
  const config = {
    stackApi: { apiKey: 'test-secret', publicKey: 'test-public' },
    stackApiLogistics: {
      baseUrl: 'https://api.stackapi.app/v1/logistics',
      alertEmail: 'cadnamart@gmail.com',
    },
  };
  const emailService = { sendNotificationEmail: jest.fn().mockResolvedValue(true) };
  const service = new LogisticsService(repo as any, config as any, emailService as any);

  afterEach(() => jest.restoreAllMocks());

  it('requests courier categories with the configured StackAPI key pair', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ category_id: 10, category: 'Test' }] }), {
        status: 200,
      }),
    );
    await expect(service.getCourierCategories()).resolves.toEqual({
      data: [{ category_id: 10, category: 'Test' }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.stackapi.app/v1/logistics/categories',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'X-API-Key': 'test-secret',
          'X-Public-Key': 'test-public',
        }),
      }),
    );
  });

  it('creates quote addresses then requests a StackAPI courier quote', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { id: 'sender-id' } }), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { id: 'receiver-id' } }), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { id: 'quote-id', couriers: [] } }), { status: 201 }),
      );
    const result = await service.getQuote({
      sender: {
        name: 'Seller',
        email: 'seller@example.test',
        phone: '08000000000',
        address: '1 Road',
        city: 'Lagos',
        state: 'Lagos',
      },
      receiver: {
        name: 'Buyer',
        email: 'buyer@example.test',
        phone: '08000000001',
        address: '2 Road',
        city: 'Ikeja',
        state: 'Lagos',
      },
      categoryId: 10,
      items: [{ name: 'Item', weight_kg: 0.5, value: 1000, quantity: 1 }],
      lengthCm: 20,
      widthCm: 15,
      heightCm: 5,
    });
    expect(result).toEqual({ data: { id: 'quote-id', couriers: [] } });
    const quoteCall = fetchMock.mock.calls[2];
    expect(quoteCall[0]).toBe('https://api.stackapi.app/v1/logistics/quotes');
    expect(JSON.parse(String(quoteCall[1]?.body))).toEqual(
      expect.objectContaining({
        sender_address_id: 'sender-id',
        receiver_address_id: 'receiver-id',
        category_id: 10,
        dimension: { length_cm: 20, width_cm: 15, height_cm: 5 },
      }),
    );
  });

  it('persists a booking reference and sends the selected courier to StackAPI once', async () => {
    repo.findByOrderAndGroup.mockResolvedValue(null);
    const booking = {
      _id: { toString: () => 'internal-id' },
      bookingRef: 'LB-1234',
      shipmentReference: null,
      orderId: 'order',
      orderRef: 'CM-REF',
      groupKey: 'seller:cadna_logistics:10',
      provider: 'stackapi',
      status: 'pending',
      quoteId: 'quote-1',
      courierId: 'courier-1',
      serviceCode: 'express',
      bookingUncertain: false,
    };
    repo.create.mockResolvedValue(booking);
    repo.update.mockImplementation(async (_id, data) => ({ ...booking, ...data }));
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: 'shipment-1',
            status: 'pending',
            tracking_url: 'https://track.example.test/1',
          },
        }),
        { status: 201 },
      ),
    );
    const result = await service.bookCourier({
      orderId: 'order',
      orderRef: 'CM-REF',
      groupKey: 'seller:cadna_logistics:10',
      quoteId: 'quote-1',
      courierId: 'courier-1',
      serviceCode: 'express',
    });
    expect(result).toMatchObject({
      externalBookingId: 'shipment-1',
      trackingUrl: 'https://track.example.test/1',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      quote_id: 'quote-1',
      courier_id: 'courier-1',
      service_code: 'express',
      reference: 'LB-1234',
    });
  });

  it('refreshes StackAPI tracking and returns the saved current status', async () => {
    const booking = {
      _id: { toString: () => 'internal-id' },
      bookingRef: 'LB-1234',
      provider: 'stackapi',
      externalBookingId: 'shipment-1',
      status: 'pending',
      trackingUrl: null,
      trackingEvents: [],
    };
    repo.findByIdForUser.mockResolvedValue(booking);
    repo.update.mockImplementation(async (_id, data) => ({ ...booking, ...data }));
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: 'shipment-1',
            status: 'in_transit',
            tracking_url: 'https://track.example.test/1',
          },
        }),
        { status: 200 },
      ),
    );

    await expect(service.getTracking('internal-id', 'buyer-id', 'buyer')).resolves.toMatchObject({
      bookingRef: 'LB-1234',
      status: 'in_transit',
      trackingUrl: 'https://track.example.test/1',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.stackapi.app/v1/logistics/shipments/shipment-1',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(repo.update).toHaveBeenCalledWith(
      'internal-id',
      expect.objectContaining({ status: 'in_transit' }),
    );
  });

  it('does not reveal another user’s booking', async () => {
    repo.findByIdForUser.mockResolvedValue(null);
    await expect(service.getBooking('internal-id', 'other-user', 'buyer')).rejects.toThrow(
      'Booking not found',
    );
    expect(repo.findByIdForUser).toHaveBeenCalledWith('internal-id', 'other-user', 'buyer');
  });

  it('does not return the seller pickup address to a buyer', async () => {
    repo.findByIdForUser.mockResolvedValue({
      _id: { toString: () => 'internal-id' },
      bookingRef: 'LB-1234',
      pickupAddress: { street1: 'Private seller address' },
      dropoffAddress: { street1: 'Buyer address' },
    });
    const result = await service.getBooking('internal-id', 'buyer-id', 'buyer');
    expect(result).not.toHaveProperty('pickupAddress');
    expect(result).toHaveProperty('dropoffAddress.street1', 'Buyer address');
  });
});
