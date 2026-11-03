import { SupportOutboxPublisher } from './support-outbox.publisher';
import { NotificationCategory } from '@notifications/schemas/notification.schema';

describe('SupportOutboxPublisher', () => {
  const repository = {
    claimOutboxEvents: jest.fn(),
    findById: jest.fn(),
    findMessageById: jest.fn(),
    markOutboxPublished: jest.fn(),
    retryOutboxEvent: jest.fn(),
  };
  const gateway = {
    publishTicketMessage: jest.fn(),
    publishTicketUpdated: jest.fn(),
  };
  const notificationsService = { createForUser: jest.fn() };
  let publisher: SupportOutboxPublisher;

  beforeEach(() => {
    jest.clearAllMocks();
    publisher = new SupportOutboxPublisher(
      repository as any,
      gateway as any,
      notificationsService as any,
    );
    repository.claimOutboxEvents.mockResolvedValue([]);
    repository.markOutboxPublished.mockResolvedValue(undefined);
    repository.retryOutboxEvent.mockResolvedValue(undefined);
    notificationsService.createForUser.mockResolvedValue({ notification: {}, suppressed: false });
  });

  it('broadcasts an admin reply and sends an in-app/push update without email', async () => {
    const event = {
      id: 'event-1',
      ticketId: 'ticket-1',
      eventType: 'ticket.message.created',
      payload: { messageId: 'message-1' },
      attempts: 1,
    };
    repository.claimOutboxEvents.mockResolvedValue([event]);
    repository.findById.mockResolvedValue({
      id: 'ticket-1',
      userId: 'buyer-1',
      accountType: 'buyer',
      subject: 'Order help',
      withdrawnAt: null,
    });
    repository.findMessageById.mockResolvedValue({
      id: 'message-1',
      sequence: 2,
      clientMessageId: 'admin-reply-1',
      authorUserId: 'admin-1',
      authorRole: 'admin',
      body: 'We are checking this.',
      sentAt: new Date('2026-11-02T10:00:00.000Z'),
    });

    await publisher.poll();

    expect(gateway.publishTicketMessage).toHaveBeenCalledWith(
      'event-1',
      'ticket-1',
      expect.objectContaining({ body: 'We are checking this.', authorRole: 'admin' }),
    );
    expect(notificationsService.createForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'buyer-1',
        category: NotificationCategory.SUPPORT_UPDATES,
        sendEmail: false,
        idempotencyKey: 'event-1',
      }),
    );
    expect(repository.markOutboxPublished).toHaveBeenCalledWith('event-1');
  });

  it('notifies the ticket owner after an admin status change', async () => {
    const event = {
      id: 'event-2',
      ticketId: 'ticket-2',
      eventType: 'ticket.updated',
      payload: { status: 'closed', accountType: 'seller', notifyUser: true },
      attempts: 1,
    };
    repository.claimOutboxEvents.mockResolvedValue([event]);
    repository.findById.mockResolvedValue({
      id: 'ticket-2',
      userId: 'seller-1',
      accountType: 'seller',
      subject: 'Payout question',
      status: 'closed',
      withdrawnAt: null,
    });

    await publisher.poll();

    expect(gateway.publishTicketUpdated).toHaveBeenCalledWith(
      'event-2',
      'ticket-2',
      expect.objectContaining({ status: 'closed', accountType: 'seller' }),
    );
    expect(notificationsService.createForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'seller-1',
        title: 'Your support ticket was updated',
        body: 'Payout question: Resolved',
        sendEmail: false,
      }),
    );
    expect(repository.markOutboxPublished).toHaveBeenCalledWith('event-2');
  });

  it('releases an event for retry when realtime publication throws', async () => {
    const event = {
      id: 'event-3',
      ticketId: 'ticket-3',
      eventType: 'ticket.updated',
      payload: { status: 'open', accountType: 'buyer', notifyUser: false },
      attempts: 2,
    };
    repository.claimOutboxEvents.mockResolvedValue([event]);
    repository.findById.mockResolvedValue({ id: 'ticket-3', withdrawnAt: null });
    gateway.publishTicketUpdated.mockImplementation(() => {
      throw new Error('socket failure');
    });

    await publisher.poll();

    expect(repository.retryOutboxEvent).toHaveBeenCalledWith('event-3', 2, 'publish_failed');
    expect(repository.markOutboxPublished).not.toHaveBeenCalled();
  });
});
