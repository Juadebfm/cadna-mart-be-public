import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { AuthService } from './auth.service';

jest.mock('@clerk/backend', () => ({
  createClerkClient: jest.fn(),
  verifyToken: jest.fn(),
}));

describe('AuthService Clerk login', () => {
  const usersService = {
    findByEmail: jest.fn(),
    findByClerkId: jest.fn(),
    findDeletedByClerkId: jest.fn(),
    findDeletedByEmail: jest.fn(),
    createClerkBuyer: jest.fn(),
    syncClerkIdentity: jest.fn(),
    reactivateClerkUser: jest.fn(),
    findById: jest.fn(),
    toPublicUser: jest.fn((user) => user),
  };
  const authEventsService = { log: jest.fn() };
  const clerkUser = {
    id: 'clerk-user-1',
    primaryEmailAddressId: null as string | null,
    emailAddresses: [] as Array<{
      id: string;
      emailAddress: string;
      verification: { status: string } | null;
    }>,
    primaryPhoneNumberId: 'phone-1',
    phoneNumbers: [
      { id: 'phone-1', phoneNumber: '+2348012345678', verification: { status: 'verified' } },
    ],
    firstName: 'Jane',
    lastName: 'Doe',
  };
  let authService: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    (verifyToken as jest.Mock).mockResolvedValue({ sub: 'clerk-user-1' });
    (createClerkClient as jest.Mock).mockReturnValue({
      users: { getUser: jest.fn().mockResolvedValue(clerkUser) },
    });
    Object.assign(clerkUser, {
      primaryEmailAddressId: null,
      emailAddresses: [],
      primaryPhoneNumberId: 'phone-1',
      phoneNumbers: [
        { id: 'phone-1', phoneNumber: '+2348012345678', verification: { status: 'verified' } },
      ],
    });
    usersService.findByEmail.mockResolvedValue(null);
    usersService.findByClerkId.mockResolvedValue(null);
    usersService.findDeletedByClerkId.mockResolvedValue(null);
    usersService.findDeletedByEmail.mockResolvedValue(null);
    usersService.createClerkBuyer.mockResolvedValue({
      _id: { toString: () => 'buyer-1' },
      email: null,
    });
    usersService.findById.mockResolvedValue({ _id: { toString: () => 'buyer-1' }, email: null });
    usersService.syncClerkIdentity.mockImplementation(async (_id, identity) => ({
      _id: { toString: () => 'buyer-1' },
      ...identity,
    }));
    authEventsService.log.mockResolvedValue(undefined);

    authService = new AuthService(
      usersService as never,
      {} as never,
      {
        clerk: { secretKey: 'test-key', jwtKey: '' },
        cors: { origin: 'https://shop.example.com' },
        app: { nodeEnv: 'dev' },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      authEventsService as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest.spyOn(authService as never, 'issueTokens' as never).mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresIn: '15m',
    } as never);
  });

  it('creates a phone-only buyer keyed by Clerk ID and records verified phone', async () => {
    await authService.clerkLogin('session-token');

    expect(usersService.createClerkBuyer).toHaveBeenCalledWith({
      clerkId: 'clerk-user-1',
      email: null,
      phoneNumber: '+2348012345678',
      isPhoneVerified: true,
      firstName: 'Jane',
      lastName: 'Doe',
    });
  });

  it('does not auto-link a verified email to an existing Cadna account', async () => {
    Object.assign(clerkUser, {
      primaryEmailAddressId: 'email-1',
      emailAddresses: [
        { id: 'email-1', emailAddress: 'JANE@example.com', verification: { status: 'verified' } },
      ],
    });
    const existing = {
      _id: { toString: () => 'buyer-1' },
      email: 'jane@example.com',
      clerkId: null,
      firstName: 'Jane',
      lastName: 'Doe',
    };
    usersService.findByEmail.mockResolvedValue(existing);

    await expect(authService.clerkLogin('session-token')).rejects.toBeInstanceOf(ConflictException);

    expect(usersService.findByEmail).toHaveBeenCalledWith('jane@example.com');
    expect(usersService.syncClerkIdentity).not.toHaveBeenCalled();
    expect(usersService.createClerkBuyer).not.toHaveBeenCalled();
  });

  it('rejects a Clerk user without a verified email or phone', async () => {
    Object.assign(clerkUser, {
      phoneNumbers: [
        { id: 'phone-1', phoneNumber: '+2348012345678', verification: { status: 'unverified' } },
      ],
    });

    await expect(authService.clerkLogin('session-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(usersService.createClerkBuyer).not.toHaveBeenCalled();
  });
});
