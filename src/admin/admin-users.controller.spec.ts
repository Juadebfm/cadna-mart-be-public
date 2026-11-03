import { AdminUsersController } from './admin-users.controller';
import { AccountType } from '@users/enums/account-type.enum';
import { DataRequestKind, DataRequestSource } from '@data-requests/schemas/data-request.schema';

describe('AdminUsersController deletion', () => {
  const buyer = {
    id: 'buyer-1',
    accountType: AccountType.BUYER,
    email: 'buyer@example.com',
    phoneNumber: '+2348012345678',
    isPhoneVerified: true,
  };
  const usersService = {
    findById: jest.fn(),
    remove: jest.fn(),
  };
  const dataRequestsService = {
    create: jest.fn(),
    deleteSellerApplicationDocuments: jest.fn().mockResolvedValue({ deleted: 0 }),
  };
  let controller: AdminUsersController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminUsersController(usersService as any, dataRequestsService as any);
  });

  it('routes buyer deletion through the pending erasure review workflow', async () => {
    usersService.findById.mockResolvedValue(buyer);
    dataRequestsService.create.mockResolvedValue({
      id: 'request-1',
      status: 'pending',
      createdAt: new Date('2026-10-29T12:00:00.000Z'),
    });

    const result = await controller.remove('buyer-1');

    expect(dataRequestsService.create).toHaveBeenCalledWith(
      'buyer-1',
      DataRequestKind.DELETE,
      expect.stringContaining('administrator'),
      buyer.email,
      buyer.phoneNumber,
      DataRequestSource.ADMIN,
    );
    expect(usersService.remove).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ id: 'request-1', status: 'pending' }));
  });

  it('keeps non-buyer admin removal as a soft-delete operation', async () => {
    usersService.findById.mockResolvedValue({ ...buyer, accountType: AccountType.SELLER });

    const result = await controller.remove('seller-1');

    expect(usersService.remove).toHaveBeenCalledWith('seller-1');
    expect(dataRequestsService.deleteSellerApplicationDocuments).toHaveBeenCalledWith('seller-1');
    expect(dataRequestsService.create).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'seller-1', status: 'soft_deleted' });
  });
});
