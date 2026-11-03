import { ConflictException } from '@nestjs/common';
import { ProductsRepository } from './products.repository';

describe('ProductsRepository stock updates', () => {
  it('locks the product and rejects a stock edit while a reservation is held', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      inventoryReservation: { count: jest.fn().mockResolvedValue(1) },
      product: { update: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const repository = new ProductsRepository(prisma as any);

    await expect(repository.update('product-id', { stockQty: 4 } as any)).rejects.toThrow(
      ConflictException,
    );
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.inventoryReservation.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ productId: 'product-id' }) }),
    );
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it('returns period sales for a product from paid orders and confirmed refund data', async () => {
    const bucket = new Date('2026-10-01T00:00:00.000Z');
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ bucket, unitsSold: 3 }]) };
    const repository = new ProductsRepository(prisma as any);

    const result = await repository.getSalesSeries(
      'product-id',
      'month',
      new Date('2026-10-01T00:00:00.000Z'),
      new Date('2026-10-31T23:59:59.999Z'),
    );

    expect(result).toEqual([{ bucket, unitsSold: 3 }]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
