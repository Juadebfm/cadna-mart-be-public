import { BadRequestException } from '@nestjs/common';
import { DataRequestsService } from './data-requests.service';
import { DataRequestDecision } from './dto/process-data-request.dto';
import {
  DataRequestKind,
  DataRequestStatus,
  DataRetentionCategory,
} from './schemas/data-request.schema';

describe('DataRequestsService deletion lifecycle', () => {
  let service: DataRequestsService;
  let prisma: any;
  let tx: any;
  let request: any;
  let sellerDocuments: any[];
  let config: any;
  let upload: any;

  beforeEach(() => {
    sellerDocuments = [];
    request = {
      id: 'request-1',
      userId: 'buyer-1',
      kind: DataRequestKind.DELETE,
      status: DataRequestStatus.PENDING,
      requesterEmail: null,
      requesterPhone: null,
      decisionNotes: null,
      processingStartedAt: null,
      processedAt: null,
      completedAt: null,
      retentionItems: [],
    };

    const delegate = () => ({
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn().mockImplementation(async () => request),
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } }),
      groupBy: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockImplementation(async ({ data }) => {
        Object.assign(request, data);
        return request;
      }),
      delete: jest.fn().mockResolvedValue({}),
    });
    tx = {
      dataRequest: delegate(),
      dataRequestRetention: delegate(),
      user: delegate(),
      review: delegate(),
      reviewHelpfulVote: delegate(),
      product: delegate(),
      address: delegate(),
      cart: delegate(),
      wishlistItem: delegate(),
      notification: delegate(),
      notificationDevice: delegate(),
      recentlyViewed: delegate(),
      otp: delegate(),
      sellerFollower: delegate(),
      checkoutSession: delegate(),
      sellerApplicationDocument: delegate(),
      sellerProfile: delegate(),
      authEvent: delegate(),
      supportTicket: delegate(),
      wallet: delegate(),
      rewardsAccount: delegate(),
      order: delegate(),
      returnRequest: delegate(),
    };
    prisma = {
      dataRequest: {
        ...delegate(),
        findUnique: jest.fn().mockImplementation(async () => request),
        findUniqueOrThrow: jest.fn().mockImplementation(async () => request),
        update: jest.fn().mockImplementation(async ({ data }) => Object.assign(request, data)),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      dataRequestRetention: delegate(),
      user: {
        ...delegate(),
        findUnique: jest.fn().mockResolvedValue({
          id: 'buyer-1',
          authProvider: 'local',
          clerkId: null,
          avatarPublicId: null,
        }),
      },
      order: { count: jest.fn().mockResolvedValue(0) },
      review: { findMany: jest.fn().mockResolvedValue([]) },
      returnRequest: { count: jest.fn().mockResolvedValue(0) },
      supportTicket: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      wallet: { findUnique: jest.fn().mockResolvedValue(null) },
      sellerApplicationDocument: {
        findMany: jest.fn().mockImplementation(async () => sellerDocuments),
        updateMany: jest.fn().mockImplementation(async () => ({ count: sellerDocuments.length })),
      },
      sellerProfile: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn(async (callback: (client: any) => unknown) => callback(tx)),
    };
    config = { clerk: { secretKey: '' }, storage: { cloudName: '' } };
    upload = {
      deleteFile: jest.fn(),
      deletePrivateSellerDocument: jest.fn().mockResolvedValue(undefined),
    };
    const email = { sendNotificationEmail: jest.fn().mockResolvedValue(true) };
    const sms = { send: jest.fn().mockResolvedValue(true) };
    service = new DataRequestsService(
      prisma,
      config as any,
      upload as any,
      email as any,
      sms as any,
    );
  });

  it('erases the user and completes an approved request when no retained category is required', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'buyer-1',
      authProvider: 'local',
      clerkId: null,
      avatarPublicId: null,
    });

    const result = await service.processDeletionRequest(
      request.id,
      'admin-1',
      DataRequestDecision.APPROVE,
      undefined,
    );

    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'buyer-1' },
        data: expect.objectContaining({
          email: null,
          phoneNumber: null,
          isActive: false,
          deletedAt: expect.any(Date),
        }),
      }),
    );
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: 'buyer-1' } });
    expect(result.status).toBe(DataRequestStatus.COMPLETED);
  });

  it('anonymizes the profile and keeps the request in progress for an approved retention hold', async () => {
    request.retentionItems = [
      {
        id: 'retention-1',
        category: DataRetentionCategory.AUTH_EVENTS,
        lawfulBasis: 'Approved statutory basis',
        purpose: 'Security investigation records',
        retainUntil: new Date(Date.now() + 86_400_000),
        purgedAt: null,
      },
    ];

    const result = await service.processDeletionRequest(
      request.id,
      'admin-1',
      DataRequestDecision.APPROVE,
      undefined,
    );

    expect(tx.user.update).toHaveBeenCalled();
    expect(tx.user.delete).not.toHaveBeenCalled();
    expect(result.status).toBe(DataRequestStatus.IN_PROGRESS);
    expect((result as { retentionItems: { category: string }[] }).retentionItems[0].category).toBe(
      DataRetentionCategory.AUTH_EVENTS,
    );
  });

  it('does not erase an account with an open order until a retention disposition is supplied', async () => {
    prisma.order.count.mockResolvedValue(1);

    await expect(
      service.processDeletionRequest(request.id, 'admin-1', DataRequestDecision.APPROVE, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('purges an expired category and completes the request when no holds remain', async () => {
    request.status = DataRequestStatus.IN_PROGRESS;
    request.retentionItems = [
      {
        id: 'retention-1',
        category: DataRetentionCategory.AUTH_EVENTS,
        lawfulBasis: 'Approved statutory basis',
        purpose: 'Security investigation records',
        retainUntil: new Date(Date.now() - 86_400_000),
        purgedAt: null,
      },
    ];

    const result = await service.purgeExpiredRetention(request.id, 'admin-1');

    expect(tx.authEvent.deleteMany).toHaveBeenCalledWith({ where: { userId: 'buyer-1' } });
    expect(tx.user.deleteMany).toHaveBeenCalledWith({ where: { id: 'buyer-1' } });
    expect(result.status).toBe(DataRequestStatus.COMPLETED);
  });

  it('deletes private seller identity files immediately during approved account erasure', async () => {
    sellerDocuments = [{ id: 'doc-1', storageKey: 'private/key', resourceType: 'raw' }];
    config.storage.cloudName = 'configured';

    await service.processDeletionRequest(
      request.id,
      'admin-1',
      DataRequestDecision.APPROVE,
      undefined,
    );

    expect(upload.deletePrivateSellerDocument).toHaveBeenCalledWith('private/key', 'raw');
    expect(prisma.sellerApplicationDocument.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['doc-1'] }, deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      }),
    );
  });

  it('keeps erasure in progress if private seller identity files cannot be deleted', async () => {
    sellerDocuments = [{ id: 'doc-1', storageKey: 'private/key', resourceType: 'raw' }];
    config.storage.cloudName = 'configured';
    upload.deletePrivateSellerDocument.mockRejectedValue(new Error('provider unavailable'));

    await expect(
      service.processDeletionRequest(request.id, 'admin-1', DataRequestDecision.APPROVE, undefined),
    ).rejects.toThrow('Seller identity files could not be deleted');

    expect(tx.user.delete).not.toHaveBeenCalled();
    expect(prisma.dataRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: DataRequestStatus.IN_PROGRESS, processingStartedAt: null },
      }),
    );
  });
});
