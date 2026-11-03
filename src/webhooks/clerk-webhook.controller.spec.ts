import { ClerkWebhookController } from './clerk-webhook.controller';

const mockVerify = jest.fn();
jest.mock('svix', () => ({
  Webhook: jest.fn().mockImplementation(() => ({ verify: mockVerify })),
}));

describe('ClerkWebhookController raw-body verification', () => {
  let controller: ClerkWebhookController;
  const config = { clerk: { webhookSecret: 'test-webhook-secret' } };
  const users = { findByClerkId: jest.fn(), setActive: jest.fn() };
  const logger = { debug: jest.fn(), error: jest.fn(), log: jest.fn(), warn: jest.fn() };
  const notifications = {};
  const dataRequests = { create: jest.fn() };

  beforeEach(() => {
    mockVerify.mockReset();
    users.findByClerkId.mockReset();
    users.setActive.mockReset();
    dataRequests.create.mockReset();
    controller = new ClerkWebhookController(
      config as any,
      users as any,
      logger as any,
      notifications as any,
      dataRequests as any,
    );
  });

  it('passes the exact raw buffer to Svix verification', async () => {
    const rawBody = Buffer.from('{ "type": "unhandled.event", "data": {} }');
    mockVerify.mockReturnValue({
      type: 'unhandled.event',
      data: {},
    });
    const req = {
      rawBody,
      body: { type: 'unhandled.event', data: {} },
      headers: {
        'svix-id': 'msg-test',
        'svix-timestamp': '1700000000',
        'svix-signature': 'v1,test',
      },
    } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() } as any;

    await controller.handleClerkWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockVerify).toHaveBeenCalledWith(
      rawBody,
      expect.objectContaining({ 'svix-id': 'msg-test' }),
    );
  });

  it('rejects a request when raw bytes are unavailable', async () => {
    const req = {
      body: { type: 'unhandled.event', data: {} },
      headers: {
        'svix-id': 'msg-test',
        'svix-timestamp': '1700000000',
        'svix-signature': 'v1,test',
      },
    } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() } as any;

    await controller.handleClerkWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('queues reviewed erasure and disables local access when Clerk deletes the identity', async () => {
    const user = {
      _id: { toString: () => 'buyer-1' },
      email: 'buyer@example.com',
      phoneNumber: '+2348012345678',
      isPhoneVerified: true,
    };
    users.findByClerkId.mockResolvedValue(user);
    dataRequests.create.mockResolvedValue({ id: 'request-1', status: 'pending' });
    mockVerify.mockReturnValue({ type: 'user.deleted', data: { id: 'clerk-user-1' } });
    const req = {
      rawBody: Buffer.from('{"type":"user.deleted"}'),
      headers: {
        'svix-id': 'msg-test',
        'svix-timestamp': '1700000000',
        'svix-signature': 'v1,test',
      },
    } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() } as any;

    await controller.handleClerkWebhook(req, res);

    expect(dataRequests.create).toHaveBeenCalledWith(
      'buyer-1',
      'delete',
      expect.stringContaining('Clerk identity was deleted'),
      'buyer@example.com',
      '+2348012345678',
      'clerk',
    );
    expect(users.setActive).toHaveBeenCalledWith('buyer-1', false);
  });
});
