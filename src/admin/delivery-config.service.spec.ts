import { ConflictException, NotFoundException } from '@nestjs/common';
import { DeliveryConfigService } from './delivery-config.service';

describe('DeliveryConfigService', () => {
  const prisma = {
    $transaction: jest.fn(),
    deliveryZone: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    deliveryRate: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  let service: DeliveryConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    const tx = {
      $queryRaw: jest.fn(),
      deliveryZone: prisma.deliveryZone,
      deliveryRate: prisma.deliveryRate,
    };
    prisma.$transaction.mockImplementation((callback: (tx: any) => unknown) => callback(tx));
    service = new DeliveryConfigService(prisma as any);
    prisma.deliveryZone.findMany.mockResolvedValue([]);
    prisma.deliveryZone.findFirst.mockResolvedValue(null);
    prisma.deliveryZone.findUnique.mockResolvedValue(null);
    prisma.deliveryZone.create.mockImplementation(async ({ data, include }: any) => ({
      ...data,
      rates: include ? [] : undefined,
    }));
    prisma.deliveryZone.update.mockImplementation(async ({ where, data }: any) => ({
      id: where.id,
      ...data,
    }));
    prisma.deliveryRate.findMany.mockResolvedValue([]);
    prisma.deliveryRate.findFirst.mockResolvedValue(null);
    prisma.deliveryRate.findUnique.mockResolvedValue(null);
    prisma.deliveryRate.create.mockImplementation(async ({ data }: any) => data);
    prisma.deliveryRate.update.mockImplementation(async ({ where, data }: any) => ({
      id: where.id,
      ...data,
    }));
  });

  it('creates an active zone with normalized LGA whitespace', async () => {
    await service.createZone({
      name: 'Lagos Metro',
      state: 'Lagos',
      lgaNames: [' Ikeja  ', '  Surulere '],
    });

    expect(prisma.deliveryZone.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: 'Lagos',
          name: 'Lagos Metro',
          lgaNames: ['Ikeja', 'Surulere'],
        }),
      }),
    );
  });

  it('rejects assigning an LGA already present in another active zone in the same state', async () => {
    prisma.deliveryZone.findMany.mockResolvedValueOnce([
      { name: 'Existing zone', lgaNames: ['Ikeja'] },
    ]);

    await expect(
      service.createZone({ name: 'New zone', state: 'Lagos', lgaNames: ['ikeja'] }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.deliveryZone.create).not.toHaveBeenCalled();
  });

  it('rejects overlapping active weight ranges for the same zone and method', async () => {
    prisma.deliveryZone.findFirst.mockResolvedValueOnce({ id: 'zone-id' });
    prisma.deliveryRate.findMany.mockResolvedValueOnce([
      { minWeightGrams: 0, maxWeightGrams: 1000 },
    ]);

    await expect(
      service.createRate('zone-id', {
        method: 'seller_owned_courier',
        minWeightGrams: 500,
        maxWeightGrams: 1500,
        amountKobo: 250000,
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.deliveryRate.create).not.toHaveBeenCalled();
  });

  it('requires an active zone before adding a delivery rate', async () => {
    await expect(
      service.createRate('missing-zone', {
        method: 'seller_owned_courier',
        minWeightGrams: 0,
        amountKobo: 250000,
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
