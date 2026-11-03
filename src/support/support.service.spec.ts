import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FileTypeValidator } from '@nestjs/common';
import { SupportService } from './support.service';
import { TicketCategory, TicketStatus } from './schemas/support-ticket.schema';

describe('SupportService', () => {
  let service: SupportService;
  let repository: {
    create: jest.Mock;
    findAccessibleOrder: jest.Mock;
    findByUserAndId: jest.Mock;
    findAttachmentForTicket: jest.Mock;
    updateForUser: jest.Mock;
    pushMessageForUser: jest.Mock;
    pushMessage: jest.Mock;
    findMessageByClientId: jest.Mock;
    findById: jest.Mock;
  };
  let uploadService: {
    uploadPrivateSupportAttachment: jest.Mock;
    deletePrivateSupportAttachment: jest.Mock;
    createPrivateSupportAttachmentDownloadUrl: jest.Mock;
  };

  const userId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const ticketId = 'bbbbbbbbbbbbbbbbbbbbbbbb';

  const ticket = (overrides: Record<string, unknown> = {}) => ({
    _id: { toString: () => ticketId },
    userId,
    accountType: 'buyer',
    guestEmail: null,
    subject: 'Order help',
    body: 'Please help with this order',
    category: TicketCategory.ORDER,
    status: TicketStatus.OPEN,
    assignedTo: null,
    messages: [],
    orderId: null,
    attachments: [],
    privateAttachments: [],
    closedAt: null,
    withdrawnAt: null,
    createdAt: new Date('2026-11-01T10:00:00.000Z'),
    updatedAt: new Date('2026-11-01T10:00:00.000Z'),
    ...overrides,
  });

  beforeEach(() => {
    jest.spyOn(FileTypeValidator.prototype, 'isValid').mockResolvedValue(true);
    repository = {
      create: jest.fn().mockImplementation(async (data) =>
        ticket({
          userId: data.userId,
          accountType: data.accountType,
          category: data.category,
          subject: data.subject,
          body: data.body,
        }),
      ),
      findAccessibleOrder: jest.fn(),
      findByUserAndId: jest.fn(),
      findAttachmentForTicket: jest.fn(),
      updateForUser: jest.fn(),
      pushMessageForUser: jest.fn(),
      pushMessage: jest.fn(),
      findMessageByClientId: jest.fn(),
      findById: jest.fn(),
    };
    uploadService = {
      uploadPrivateSupportAttachment: jest.fn(),
      deletePrivateSupportAttachment: jest.fn().mockResolvedValue(undefined),
      createPrivateSupportAttachmentDownloadUrl: jest
        .fn()
        .mockReturnValue('https://signed.test/file'),
    };
    service = new SupportService(repository as any, uploadService as any);
  });

  afterEach(() => jest.restoreAllMocks());

  it('creates a buyer ticket in buyer context', async () => {
    const result = (await service.create(
      { subject: 'Order help', body: 'Please help', category: TicketCategory.ORDER },
      userId,
      'buyer',
    )) as Record<string, unknown>;

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId, accountType: 'buyer', category: TicketCategory.ORDER }),
      [],
    );
    expect(result.accountType).toBe('buyer');
    expect(result.categoryLabel).toBe('Orders & delivery');
    expect(result.displayStatus).toBe('Processing');
  });

  it('rejects categories that do not belong to the seller form', async () => {
    await expect(
      service.create(
        { subject: 'Payment help', body: 'Please help', category: TicketCategory.PAYMENT },
        userId,
        'seller',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('checks the owner before accepting an order reference', async () => {
    repository.findAccessibleOrder.mockResolvedValue(null);
    await expect(
      service.create(
        { subject: 'Order help', body: 'Please help', orderId: '#CM-20261101-ABC123' },
        userId,
        'buyer',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('stores buyer uploads as private attachments and removes them if ticket creation fails', async () => {
    const file = {
      buffer: Buffer.from('fake png'),
      size: 8,
      mimetype: 'image/png',
      originalname: 'photo.png',
    } as Express.Multer.File;
    const stored = {
      storageKey: 'cadna-mart/support/user-aaaaaaaaaaaaaaaaaaaaaaaa/ticket-attachments/file',
      resourceType: 'image',
      format: 'png',
      sizeBytes: 8,
    };
    uploadService.uploadPrivateSupportAttachment.mockResolvedValue(stored);
    repository.create.mockRejectedValue(new Error('database write failed'));

    await expect(
      service.create({ subject: 'Order help', body: 'Please help' }, userId, 'buyer', [file]),
    ).rejects.toThrow('database write failed');

    expect(repository.create).toHaveBeenCalledWith(expect.any(Object), [
      expect.objectContaining({
        ...stored,
        originalFileName: 'photo.png',
        contentType: 'image/png',
      }),
    ]);
    expect(uploadService.deletePrivateSupportAttachment).toHaveBeenCalledWith(
      stored.storageKey,
      stored.resourceType,
    );
  });

  it('denies a ticket from a different account context', async () => {
    repository.findByUserAndId.mockResolvedValue(null);
    await expect(service.findByIdForUser(ticketId, userId, 'seller')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('does not allow a resolved ticket to receive another message', async () => {
    repository.findByUserAndId.mockResolvedValue(ticket({ status: TicketStatus.CLOSED }));
    await expect(
      service.addMessageForUser(ticketId, { body: 'A reply' }, userId, 'buyer'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.pushMessageForUser).not.toHaveBeenCalled();
  });

  it('withdraws and hides a buyer ticket while retaining the record', async () => {
    repository.updateForUser.mockResolvedValue(
      ticket({ status: TicketStatus.CLOSED, withdrawnAt: new Date() }),
    );
    const result = (await service.withdrawForUser(ticketId, userId, 'buyer')) as Record<
      string,
      unknown
    >;
    expect(repository.updateForUser).toHaveBeenCalledWith(
      userId,
      'buyer',
      ticketId,
      expect.objectContaining({ status: TicketStatus.CLOSED, withdrawnAt: expect.any(Date) }),
    );
    expect(result.withdrawnAt).toBeInstanceOf(Date);
  });

  it('returns only a short-lived attachment download URL after owner checks', async () => {
    repository.findByUserAndId.mockResolvedValue(ticket());
    repository.findAttachmentForTicket.mockResolvedValue({
      storageKey: 'private-key',
      resourceType: 'image',
      format: 'png',
    });
    const result = (await service.getAttachmentDownloadUrlForUser(
      ticketId,
      'cccccccccccccccccccccccc',
      userId,
      'buyer',
    )) as Record<string, unknown>;
    expect(result).toEqual({ url: 'https://signed.test/file', expiresInSeconds: 60 });
    expect(repository.findByUserAndId).toHaveBeenCalledWith(userId, 'buyer', ticketId);
  });

  it('does not expose legacy public attachment URLs in ticket responses', async () => {
    repository.create.mockResolvedValue(
      ticket({
        attachments: [{ url: 'https://res.cloudinary.com/example/public.jpg', publicId: 'legacy' }],
      }),
    );
    const result = (await service.create(
      { subject: 'Order help', body: 'Please help' },
      userId,
      'buyer',
    )) as Record<string, unknown>;

    expect(result.attachments).toEqual([]);
    expect(result.privateAttachments).toEqual([]);
  });

  it('reports a conflict if a ticket closes before an admin reply is committed', async () => {
    repository.findById.mockResolvedValue(ticket());
    repository.pushMessage.mockResolvedValue(false);

    await expect(
      service.addMessage(ticketId, { body: 'Support reply' }, 'cccccccccccccccccccccccc', 'admin'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.findById).toHaveBeenCalledTimes(1);
  });
});
