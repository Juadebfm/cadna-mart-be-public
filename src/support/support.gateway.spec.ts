import { SupportGateway } from './support.gateway';

describe('SupportGateway', () => {
  const userId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const ticketId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
  let gateway: SupportGateway;
  let middleware: (socket: any, next: (error?: Error) => void) => Promise<void>;
  const jwtService = { verifyAsync: jest.fn() };
  const usersService = { findById: jest.fn() };
  const supportService = {
    authorizeRealtimeAccess: jest.fn(),
    addRealtimeMessage: jest.fn(),
  };
  const configService = {
    cors: { origin: 'https://app.example.com' },
    isDev: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = new SupportGateway(
      jwtService as any,
      usersService as any,
      supportService as any,
      configService as any,
    );
    gateway.afterInit({
      use: (handler: typeof middleware) => (middleware = handler),
    } as any);
  });

  it('requires a valid JWT and an active account before connecting', async () => {
    const socket: any = {
      handshake: {
        auth: { token: 'access-token' },
        headers: { origin: 'https://app.example.com' },
      },
      data: {},
    };
    jwtService.verifyAsync.mockResolvedValue({ sub: userId });
    usersService.findById.mockResolvedValue({
      isActive: true,
      accountType: 'buyer',
      accountTypes: ['buyer', 'seller'],
    });
    const next = jest.fn();

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.identity).toEqual({
      userId,
      accountType: 'buyer',
      accountTypes: ['buyer', 'seller'],
    });
  });

  it('rejects a socket from an unconfigured browser origin', async () => {
    const socket: any = {
      handshake: { auth: { token: 'access-token' }, headers: { origin: 'https://evil.test' } },
      data: {},
    };
    const next = jest.fn();

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('joins only an authorized ticket room in the requested account context', async () => {
    const socket: any = {
      data: {
        identity: { userId, accountTypes: ['buyer', 'seller'] },
        ticketContexts: {},
      },
      join: jest.fn().mockResolvedValue(undefined),
    };
    const ack = jest.fn();
    supportService.authorizeRealtimeAccess.mockResolvedValue(true);

    await gateway.joinTicket(socket as any, { ticketId, accountType: 'seller' }, ack);

    expect(supportService.authorizeRealtimeAccess).toHaveBeenCalledWith(
      ticketId,
      userId,
      ['buyer', 'seller'],
      'seller',
    );
    expect(socket.join).toHaveBeenCalledWith(`support-ticket:${ticketId}`);
    expect(socket.data.ticketContexts[ticketId]).toBe('seller');
    expect(ack).toHaveBeenCalledWith({ ok: true, data: { ticketId } });
  });

  it('does not allow a user to send before joining the authorized ticket room', async () => {
    const socket: any = {
      data: {
        identity: { userId, accountType: 'buyer', accountTypes: ['buyer'] },
        ticketContexts: {},
        messageTimes: [],
      },
      rooms: new Set(['socket-id']),
    };
    const ack = jest.fn();

    await gateway.sendMessage(
      socket as any,
      { ticketId, body: 'Hello', clientMessageId: 'message-1' },
      ack,
    );

    expect(supportService.addRealtimeMessage).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: 'Join this ticket before sending a message',
    });
  });
});
