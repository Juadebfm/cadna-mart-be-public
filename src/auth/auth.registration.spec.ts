import { ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { OtpType } from '@otp/enums/otp-type.enum';
import { AuthEventKind } from '@auth-events/schemas/auth-event.schema';

describe('AuthService buyer signup', () => {
  const usersService = {
    findByEmail: jest.fn(),
    create: jest.fn(),
    createVerifiedBuyerFromPendingSignup: jest.fn(),
    verifyUser: jest.fn(),
  };
  const otpService = {
    generateAndStore: jest.fn(),
    verify: jest.fn(),
  };
  const emailService = { sendVerificationCode: jest.fn() };
  const registrationSessionService = {
    createSession: jest.fn(),
    setDetails: jest.fn(),
    validateStep: jest.fn(),
    completeAndDelete: jest.fn(),
  };
  const pendingBuyerSignupService = {
    create: jest.fn(),
    findByEmail: jest.fn(),
    deleteByEmail: jest.fn(),
  };
  const authEventsService = { log: jest.fn() };

  let authService: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    usersService.findByEmail.mockResolvedValue(null);
    registrationSessionService.createSession.mockResolvedValue({ sessionId: 'session-1' });
    registrationSessionService.validateStep.mockResolvedValue({
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      dateOfBirth: null,
      phoneNumber: null,
      termsAccepted: true,
    });
    pendingBuyerSignupService.findByEmail.mockResolvedValue(null);
    otpService.generateAndStore.mockResolvedValue('123456');
    otpService.verify.mockResolvedValue(true);

    authService = new AuthService(
      usersService as never,
      {} as never,
      {} as never,
      otpService as never,
      emailService as never,
      registrationSessionService as never,
      pendingBuyerSignupService as never,
      authEventsService as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('stores all signup data as pending and sends an OTP without creating a user', async () => {
    const response = await authService.register({
      email: ' Jane@Example.com ',
      firstName: 'Jane',
      lastName: 'Doe',
      termsAccepted: true,
      password: 'SafePass!472',
      confirmPassword: 'SafePass!472',
    });

    expect(response).toEqual({
      message: 'Signup saved. Please verify your email.',
      email: 'jane@example.com',
    });
    expect(pendingBuyerSignupService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        termsAccepted: true,
        passwordHash: expect.any(String),
      }),
    );
    expect(usersService.create).not.toHaveBeenCalled();
    expect(usersService.createVerifiedBuyerFromPendingSignup).not.toHaveBeenCalled();
    expect(otpService.generateAndStore).toHaveBeenCalledWith(
      'jane@example.com',
      OtpType.EMAIL_VERIFICATION,
    );
    expect(emailService.sendVerificationCode).toHaveBeenCalledWith('jane@example.com', '123456');
  });

  it('creates the buyer only after OTP verification', async () => {
    const pending = {
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      passwordHash: 'hashed-password',
      termsAccepted: true,
    };
    const createdUser = { _id: { toString: () => 'user-1' } };
    pendingBuyerSignupService.findByEmail.mockResolvedValue(pending);
    usersService.createVerifiedBuyerFromPendingSignup.mockResolvedValue(createdUser);

    const response = await authService.verifyEmail('Jane@Example.com', '123456');

    expect(response).toEqual({ message: 'Email verified successfully' });
    expect(otpService.verify).toHaveBeenCalledWith(
      'jane@example.com',
      '123456',
      OtpType.EMAIL_VERIFICATION,
    );
    expect(usersService.createVerifiedBuyerFromPendingSignup).toHaveBeenCalledWith(pending);
    expect(pendingBuyerSignupService.deleteByEmail).toHaveBeenCalledWith('jane@example.com');
    expect(authEventsService.log).toHaveBeenCalledWith('user-1', AuthEventKind.REGISTER);
  });

  it('does not let a pending buyer signup collide with seller verification', async () => {
    pendingBuyerSignupService.findByEmail.mockResolvedValue({ email: 'jane@example.com' });
    usersService.findByEmail.mockResolvedValue({
      accountType: 'seller',
      isVerified: false,
    });

    await expect(authService.verifyEmail('jane@example.com', '123456')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(otpService.verify).not.toHaveBeenCalled();
    expect(pendingBuyerSignupService.deleteByEmail).not.toHaveBeenCalled();
  });
});
