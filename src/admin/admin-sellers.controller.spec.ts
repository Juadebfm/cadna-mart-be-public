jest.mock('@products/products.service', () => ({ ProductsService: class ProductsService {} }));
import { AdminSellersController } from './admin-sellers.controller';
import { SellerApplicationStatus } from '@sellers/schemas/seller-profile.schema';

describe('AdminSellersController seller document deletion', () => {
  it('deletes seller identity files before marking an application rejected', async () => {
    const profile = {
      id: 'profile-1',
      userId: 'user-1',
      applicationStatus: SellerApplicationStatus.PENDING,
    };
    const tx = {
      sellerProfile: { update: jest.fn() },
      sellerApplicationReview: { create: jest.fn() },
      seller: { updateMany: jest.fn() },
      user: {
        findUnique: jest.fn().mockResolvedValue({ accountTypes: ['buyer'] }),
        update: jest.fn(),
      },
    };
    const prisma = {
      sellerProfile: { findFirst: jest.fn().mockResolvedValue(profile) },
      $transaction: jest.fn(async (operation) => operation(tx)),
    };
    const dataRequestsService = {
      deleteSellerApplicationDocuments: jest.fn().mockResolvedValue({ deleted: 1 }),
    };
    const controller = new AdminSellersController(
      {} as any,
      {} as any,
      prisma as any,
      dataRequestsService as any,
    );

    await controller.rejectApplication('user-1', 'admin-1', { reason: 'Unable to verify' } as any);

    expect(dataRequestsService.deleteSellerApplicationDocuments).toHaveBeenCalledWith('user-1');
    expect(
      dataRequestsService.deleteSellerApplicationDocuments.mock.invocationCallOrder[0],
    ).toBeLessThan(prisma.$transaction.mock.invocationCallOrder[0]);
    expect(tx.seller.updateMany).toHaveBeenCalledWith({
      where: { ownerId: 'user-1', deletedAt: null },
      data: { isActive: false },
    });
  });

  it('does not change application status if Cloudinary deletion fails', async () => {
    const prisma = {
      sellerProfile: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'profile-1',
          userId: 'user-1',
          applicationStatus: SellerApplicationStatus.PENDING,
        }),
      },
      $transaction: jest.fn(),
    };
    const dataRequestsService = {
      deleteSellerApplicationDocuments: jest
        .fn()
        .mockRejectedValue(new Error('storage unavailable')),
    };
    const controller = new AdminSellersController(
      {} as any,
      {} as any,
      prisma as any,
      dataRequestsService as any,
    );

    await expect(
      controller.rejectApplication('user-1', 'admin-1', { reason: 'Unable to verify' } as any),
    ).rejects.toThrow('storage unavailable');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
