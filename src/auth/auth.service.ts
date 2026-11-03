import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { PrismaService } from '@database/prisma.service';
import { isPrismaUniqueConstraintError } from '@database/prisma-errors';
import { ConfigService } from '@config/config.service';
import { UsersService } from '@users/users.service';
import { User } from '@users/schemas/user.schema';
import { OtpService } from '@otp/otp.service';
import { OtpType } from '@otp/enums/otp-type.enum';
import { EmailService } from '@email/email.service';
import { RegistrationSessionService } from '@registration-session/registration-session.service';
import { PendingBuyerSignupService } from '@registration-session/pending-buyer-signup.service';
import { JwtPayload, TokenResponse } from './interfaces/jwt-payload.interface';
import { comparePassword, hashPassword } from '@common/utils/hash.util';
import { ERROR_MESSAGES } from '@common/constants/error-messages.constants';
import { validatePasswordStrength } from '@common/validators/password-strength.validator';
import { AccountType } from '@users/enums/account-type.enum';
import { AuthProvider } from '@users/enums/auth-provider.enum';
import { OtpPurpose } from './dto/otp.dto';
import { AuthEventsService } from '@auth-events/auth-events.service';
import { AuthEventKind } from '@auth-events/schemas/auth-event.schema';
import { ChangePasswordDto } from './dto/change-password.dto';
import { NotificationsService } from '@notifications/notifications.service';
import { NotificationCategory } from '@notifications/schemas/notification.schema';
import { LoggerService } from '@logger/logger.service';

type OtpVerifyResult =
  | { purpose: OtpPurpose.LOGIN; tokens: TokenResponse; user: object }
  | { purpose: OtpPurpose.EMAIL_VERIFICATION; message: string }
  | { purpose: OtpPurpose.PASSWORD_RESET; resetToken: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly otpService: OtpService,
    private readonly emailService: EmailService,
    private readonly registrationSessionService: RegistrationSessionService,
    private readonly pendingBuyerSignupService: PendingBuyerSignupService,
    private readonly authEventsService: AuthEventsService,
    private readonly notificationsService: NotificationsService,
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── MULTI-STEP REGISTRATION ─────────────────────────────────

  async registerEmail(email: string): Promise<{ sessionId: string }> {
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException(ERROR_MESSAGES.USER_ALREADY_EXISTS);
    }

    const session = await this.registrationSessionService.createSession(email);
    return { sessionId: session.sessionId };
  }

  async registerDetails(
    sessionId: string,
    details: {
      firstName: string;
      lastName: string;
      dateOfBirth?: string;
      phoneNumber?: string;
      termsAccepted: boolean;
    },
  ): Promise<{ sessionId: string }> {
    if (details.termsAccepted !== true) {
      throw new BadRequestException('You must accept the terms and conditions to register');
    }
    await this.registrationSessionService.setDetails(sessionId, details);
    return { sessionId };
  }

  async registerPassword(
    sessionId: string,
    password: string,
    confirmPassword: string,
  ): Promise<{ message: string }> {
    if (password !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const session = await this.registrationSessionService.validateStep(sessionId, 2);

    validatePasswordStrength(password, {
      firstName: session.firstName ?? undefined,
      lastName: session.lastName ?? undefined,
      email: session.email,
    });

    const existingPending = await this.pendingBuyerSignupService.findByEmail(session.email);
    if (existingPending) {
      await this.registrationSessionService.completeAndDelete(sessionId);
      await this.resendVerificationOtp(session.email);
      return { message: 'Signup is pending verification. A verification code was sent.' };
    }

    const passwordHash = await hashPassword(password);
    try {
      await this.pendingBuyerSignupService.create({
        email: session.email,
        firstName: session.firstName!,
        lastName: session.lastName!,
        dateOfBirth: session.dateOfBirth,
        phoneNumber: session.phoneNumber,
        passwordHash,
        termsAccepted: session.termsAccepted,
      });
    } catch (error) {
      // Another request may have completed a signup for this email concurrently.
      if (!isPrismaUniqueConstraintError(error)) throw error;

      const pending = await this.pendingBuyerSignupService.findByEmail(session.email);
      if (!pending) {
        // PostgreSQL session cleanup may not have removed an expired row yet.
        await this.pendingBuyerSignupService.deleteByEmail(session.email);
        await this.pendingBuyerSignupService.create({
          email: session.email,
          firstName: session.firstName!,
          lastName: session.lastName!,
          dateOfBirth: session.dateOfBirth,
          phoneNumber: session.phoneNumber,
          passwordHash,
          termsAccepted: session.termsAccepted,
        });
      }
    }

    // Remove the incomplete wizard session once all data is in the expiring pending record.
    await this.registrationSessionService.completeAndDelete(sessionId);
    await this.sendBuyerVerificationCode(session.email);

    return { message: 'Signup saved. Please verify your email.' };
  }

  async verifyEmail(email: string, code: string): Promise<{ message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const pending = await this.pendingBuyerSignupService.findByEmail(normalizedEmail);

    if (pending) {
      const existingUser = await this.usersService.findByEmail(normalizedEmail);
      if (existingUser && existingUser.accountType !== AccountType.BUYER) {
        throw new ConflictException(ERROR_MESSAGES.USER_ALREADY_EXISTS);
      }

      if (existingUser?.isVerified) {
        await this.pendingBuyerSignupService.deleteByEmail(normalizedEmail);
        return { message: 'Email already verified' };
      }

      await this.otpService.verify(normalizedEmail, code, OtpType.EMAIL_VERIFICATION);
      if (existingUser) {
        // A legacy unverified user can exist from before pending signups were introduced.
        const userId = (existingUser as unknown as { _id: { toString(): string } })._id.toString();
        await this.usersService.verifyUser(userId);
        await this.pendingBuyerSignupService.deleteByEmail(normalizedEmail);
        await this.authEventsService.log(userId, AuthEventKind.REGISTER);
        return { message: 'Email verified successfully' };
      }

      let user;
      try {
        user = await this.usersService.createVerifiedBuyerFromPendingSignup(pending);
      } catch (error) {
        const isDuplicateEmail = isPrismaUniqueConstraintError(error);
        if (!(error instanceof ConflictException) && !isDuplicateEmail) throw error;
        // A concurrent verification may have created the account first.
        const concurrentlyCreated = await this.usersService.findByEmail(normalizedEmail);
        if (!concurrentlyCreated) throw error;
        if (
          concurrentlyCreated.accountType !== AccountType.BUYER ||
          !concurrentlyCreated.isVerified
        ) {
          throw new ConflictException(ERROR_MESSAGES.USER_ALREADY_EXISTS);
        }
        await this.pendingBuyerSignupService.deleteByEmail(normalizedEmail);
        return { message: 'Email already verified' };
      }

      const userId = (user as unknown as { _id: { toString(): string } })._id.toString();
      await this.pendingBuyerSignupService.deleteByEmail(normalizedEmail);
      await this.authEventsService.log(userId, AuthEventKind.REGISTER);
      return { message: 'Email verified successfully' };
    }

    const user = await this.usersService.findByEmail(normalizedEmail);
    if (!user) {
      throw new BadRequestException(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    if (user.isVerified) {
      return { message: 'Email already verified' };
    }

    await this.otpService.verify(normalizedEmail, code, OtpType.EMAIL_VERIFICATION);

    const userId = (user as unknown as { _id: { toString(): string } })._id.toString();
    await this.usersService.verifyUser(userId);
    await this.authEventsService.log(userId, AuthEventKind.REGISTER);

    return { message: 'Email verified successfully' };
  }

  async resendVerificationOtp(email: string): Promise<{ message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const pending = await this.pendingBuyerSignupService.findByEmail(normalizedEmail);
    if (pending) {
      await this.sendBuyerVerificationCode(normalizedEmail);
      return { message: 'Verification code sent' };
    }

    const user = await this.usersService.findByEmail(normalizedEmail);
    if (!user) {
      throw new BadRequestException(ERROR_MESSAGES.USER_NOT_FOUND);
    }
    if (user.isVerified) {
      throw new BadRequestException('Email is already verified');
    }

    await this.sendBuyerVerificationCode(normalizedEmail);

    return { message: 'Verification code sent' };
  }

  // ─── LOGIN ───────────────────────────────────────────────────

  async validateUser(
    email: string,
    password: string,
  ): Promise<{
    userId: string;
    email: string;
    accountType: string;
    accountTypes?: AccountType[];
  } | null> {
    const user = await this.usersService.findByEmailWithPassword(email);
    if (!user || !user.isActive || !user.email) {
      return null;
    }

    if (!user.password) {
      return null;
    }

    if (!user.isVerified) {
      throw new UnauthorizedException(ERROR_MESSAGES.USER_NOT_VERIFIED);
    }

    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      return null;
    }

    return {
      userId: (user as unknown as { _id: { toString(): string } })._id.toString(),
      email: user.email,
      accountType: user.accountType,
      accountTypes: user.accountTypes,
    };
  }

  async login(user: {
    userId: string;
    email: string;
    accountType: string;
    accountTypes?: AccountType[];
  }): Promise<TokenResponse | { requires2FA: true; email: string }> {
    const fullUser = await this.usersService.findById(user.userId);

    if (fullUser.isTwoFactorEnabled) {
      const code = await this.otpService.generateAndStore(
        user.email,
        OtpType.LOGIN_2FA,
        user.userId,
      );
      await this.emailService.sendLoginOtp(user.email, code);
      return { requires2FA: true, email: user.email };
    }

    const tokens = await this.issueTokens(user);
    await this.authEventsService.log(user.userId, AuthEventKind.LOGIN);
    return tokens;
  }

  async verifyLogin2fa(email: string, code: string): Promise<TokenResponse> {
    await this.otpService.verify(email, code, OtpType.LOGIN_2FA);

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException(ERROR_MESSAGES.INVALID_CREDENTIALS);
    }

    return this.issueTokens({
      userId: (user as unknown as { _id: { toString(): string } })._id.toString(),
      email: user.email,
      accountType: user.accountType,
      accountTypes: user.accountTypes,
    });
  }

  // ─── GENERIC OTP (spec-aligned) ─────────────────────────────

  async requestOtp(
    email: string,
    purpose: OtpPurpose = OtpPurpose.LOGIN,
  ): Promise<{ message: string }> {
    const normalizedEmail = email.toLowerCase();

    if (purpose === OtpPurpose.LOGIN) {
      const user = await this.usersService.findByEmail(normalizedEmail);
      if (!user) {
        // Do not reveal whether the user exists
        return { message: 'If an account exists, a login code has been sent' };
      }
      if (!user.isActive) {
        throw new UnauthorizedException(ERROR_MESSAGES.INVALID_CREDENTIALS);
      }
      if (!user.isVerified) {
        throw new UnauthorizedException(ERROR_MESSAGES.USER_NOT_VERIFIED);
      }
      const code = await this.otpService.generateAndStore(
        normalizedEmail,
        OtpType.LOGIN_2FA,
        (user as unknown as { _id: { toString(): string } })._id.toString(),
      );
      await this.emailService.sendLoginOtp(normalizedEmail, code);
      return { message: 'Login code sent' };
    }

    if (purpose === OtpPurpose.EMAIL_VERIFICATION) {
      const user = await this.usersService.findByEmail(normalizedEmail);
      if (!user) {
        throw new BadRequestException(ERROR_MESSAGES.USER_NOT_FOUND);
      }
      if (user.isVerified) {
        throw new BadRequestException('Email is already verified');
      }
      const code = await this.otpService.generateAndStore(
        normalizedEmail,
        OtpType.EMAIL_VERIFICATION,
      );
      await this.emailService.sendVerificationCode(normalizedEmail, code);
      return { message: 'Verification code sent' };
    }

    if (purpose === OtpPurpose.PASSWORD_RESET) {
      return this.forgotPassword(normalizedEmail);
    }

    throw new BadRequestException('Unsupported OTP purpose');
  }

  async verifyOtp(
    email: string,
    code: string,
    purpose: OtpPurpose = OtpPurpose.LOGIN,
  ): Promise<OtpVerifyResult> {
    const normalizedEmail = email.toLowerCase();

    if (purpose === OtpPurpose.LOGIN) {
      await this.otpService.verify(normalizedEmail, code, OtpType.LOGIN_2FA);
      const user = await this.usersService.findByEmail(normalizedEmail);
      if (!user) {
        throw new UnauthorizedException(ERROR_MESSAGES.INVALID_CREDENTIALS);
      }
      const userId = (user as unknown as { _id: { toString(): string } })._id.toString();
      const tokens = await this.issueTokens({
        userId,
        email: user.email,
        accountType: user.accountType,
        accountTypes: user.accountTypes,
      });
      await this.authEventsService.log(userId, AuthEventKind.LOGIN_OTP);
      const fullUser = await this.usersService.findById(userId);
      return {
        purpose: OtpPurpose.LOGIN,
        tokens,
        user: this.usersService.toPublicUser(fullUser),
      };
    }

    if (purpose === OtpPurpose.EMAIL_VERIFICATION) {
      await this.verifyEmail(normalizedEmail, code);
      return { purpose: OtpPurpose.EMAIL_VERIFICATION, message: 'Email verified successfully' };
    }

    if (purpose === OtpPurpose.PASSWORD_RESET) {
      const { resetToken } = await this.forgotPasswordVerify(normalizedEmail, code);
      return { purpose: OtpPurpose.PASSWORD_RESET, resetToken };
    }

    throw new BadRequestException('Unsupported OTP purpose');
  }

  async resendOtp(
    email: string,
    purpose: OtpPurpose = OtpPurpose.LOGIN,
  ): Promise<{ message: string }> {
    // requestOtp already enforces the OtpService cooldown, so reuse it.
    return this.requestOtp(email, purpose);
  }

  // ─── SINGLE-CALL REGISTRATION (spec-aligned) ───────────────

  async register(dto: {
    email: string;
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
    phoneNumber?: string;
    termsAccepted: boolean;
    password: string;
    confirmPassword: string;
  }): Promise<{ message: string; email: string }> {
    if (dto.termsAccepted !== true) {
      throw new BadRequestException('You must accept the terms and conditions to register');
    }
    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException(ERROR_MESSAGES.USER_ALREADY_EXISTS);
    }

    const pending = await this.pendingBuyerSignupService.findByEmail(email);
    if (pending) {
      await this.resendVerificationOtp(email);
      return {
        message: 'Signup is pending verification. A verification code was sent.',
        email,
      };
    }

    const { sessionId } = await this.registerEmail(email);
    await this.registerDetails(sessionId, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      dateOfBirth: dto.dateOfBirth,
      phoneNumber: dto.phoneNumber,
      termsAccepted: dto.termsAccepted,
    });
    const { message } = await this.registerPassword(sessionId, dto.password, dto.confirmPassword);
    return { message, email };
  }

  private async sendBuyerVerificationCode(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const code = await this.otpService.generateAndStore(
      normalizedEmail,
      OtpType.EMAIL_VERIFICATION,
    );
    await this.emailService.sendVerificationCode(normalizedEmail, code);
  }

  // ─── FORGOT PASSWORD ────────────────────────────────────────

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      // Don't reveal whether user exists
      return { message: 'If an account exists, a reset code has been sent' };
    }

    const code = await this.otpService.generateAndStore(
      email,
      OtpType.PASSWORD_RESET,
      (user as unknown as { _id: { toString(): string } })._id.toString(),
    );
    await this.emailService.sendPasswordResetOtp(email, code);

    return { message: 'If an account exists, a reset code has been sent' };
  }

  async forgotPasswordVerify(email: string, code: string): Promise<{ resetToken: string }> {
    await this.otpService.verify(email, code, OtpType.PASSWORD_RESET);

    // Issue a short-lived reset token
    const resetToken = await this.jwtService.signAsync(
      { email, purpose: 'password_reset' } as Record<string, unknown>,
      {
        secret: this.configService.jwt.accessSecret,
        expiresIn: '5m',
      },
    );

    return { resetToken };
  }

  async forgotPasswordReset(
    resetToken: string,
    password: string,
    confirmPassword: string,
  ): Promise<{ message: string }> {
    if (password !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    let tokenPayload: { email: string; purpose: string };
    try {
      tokenPayload = await this.jwtService.verifyAsync(resetToken, {
        secret: this.configService.jwt.accessSecret,
      });
    } catch {
      throw new UnauthorizedException(ERROR_MESSAGES.INVALID_TOKEN);
    }

    if (tokenPayload.purpose !== 'password_reset') {
      throw new UnauthorizedException(ERROR_MESSAGES.INVALID_TOKEN);
    }

    const user = await this.usersService.findByEmail(tokenPayload.email);
    if (!user) {
      throw new BadRequestException(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    validatePasswordStrength(password, {
      firstName: user.firstName,
      lastName: user.lastName,
      ...(user.email ? { email: user.email } : {}),
    });

    const hashedPassword = await hashPassword(password);
    const userId = (user as unknown as { _id: { toString(): string } })._id.toString();
    await this.usersService.updatePassword(userId, hashedPassword);
    await this.authEventsService.log(userId, AuthEventKind.PASSWORD_RESET);
    await this.notifySecurityChange(userId, 'Password reset');

    return { message: 'Password reset successfully' };
  }

  // ─── 2FA MANAGEMENT ─────────────────────────────────────────

  async initiate2faEnable(userId: string): Promise<{ message: string }> {
    const user = await this.usersService.findById(userId);
    if (user.authProvider !== AuthProvider.LOCAL) {
      throw new BadRequestException(
        'Manage two-factor authentication through your sign-in provider',
      );
    }
    if (user.isTwoFactorEnabled) {
      throw new BadRequestException(ERROR_MESSAGES.TWO_FACTOR_ALREADY_ENABLED);
    }
    if (!user.email)
      throw new BadRequestException('Email is required for email-based two-factor authentication');

    const code = await this.otpService.generateAndStore(user.email, OtpType.LOGIN_2FA, userId);
    await this.emailService.sendLoginOtp(user.email, code);

    return { message: 'Verification code sent to your email' };
  }

  async confirm2faEnable(userId: string, code: string): Promise<{ message: string }> {
    const user = await this.usersService.findById(userId);
    if (user.authProvider !== AuthProvider.LOCAL) {
      throw new BadRequestException(
        'Manage two-factor authentication through your sign-in provider',
      );
    }
    if (!user.email)
      throw new BadRequestException('Email is required for email-based two-factor authentication');
    await this.otpService.verify(user.email, code, OtpType.LOGIN_2FA);
    await this.usersService.setTwoFactor(userId, true);
    await this.authEventsService.log(userId, AuthEventKind.TWO_FACTOR_ENABLE);
    await this.notifySecurityChange(userId, 'Two-factor authentication enabled');

    return { message: 'Two-factor authentication enabled' };
  }

  async disable2fa(userId: string, code: string): Promise<{ message: string }> {
    const user = await this.usersService.findById(userId);
    if (user.authProvider !== AuthProvider.LOCAL) {
      throw new BadRequestException(
        'Manage two-factor authentication through your sign-in provider',
      );
    }
    if (!user.isTwoFactorEnabled) {
      throw new BadRequestException(ERROR_MESSAGES.TWO_FACTOR_NOT_ENABLED);
    }
    if (!user.email)
      throw new BadRequestException('Email is required for email-based two-factor authentication');

    await this.otpService.verify(user.email, code, OtpType.LOGIN_2FA);
    await this.usersService.setTwoFactor(userId, false);
    await this.authEventsService.log(userId, AuthEventKind.TWO_FACTOR_DISABLE);
    await this.notifySecurityChange(userId, 'Two-factor authentication disabled');

    return { message: 'Two-factor authentication disabled' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ message: string }> {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('New password and confirmation do not match');
    }

    const user = await this.usersService.findByIdWithPassword(userId);
    if (!user || !user.isActive) throw new UnauthorizedException();
    if (user.authProvider !== AuthProvider.LOCAL || !user.password) {
      throw new BadRequestException('Manage your password through your sign-in provider');
    }
    if (!(await comparePassword(dto.currentPassword, user.password))) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    validatePasswordStrength(dto.newPassword, {
      firstName: user.firstName,
      lastName: user.lastName,
      ...(user.email ? { email: user.email } : {}),
    });
    await this.usersService.updatePassword(userId, await hashPassword(dto.newPassword));
    await this.notifySecurityChange(userId, 'Password changed');
    return { message: 'Password updated successfully' };
  }

  private async notifySecurityChange(userId: string, title: string): Promise<void> {
    try {
      await this.notificationsService.createForUser({
        userId,
        category: NotificationCategory.SECURITY_ALERTS,
        title,
        body: 'A security setting on your CADNA Mart account was changed.',
      });
    } catch (error) {
      this.logger.warn(
        `Could not create security notification for user ${userId}: ${(error as Error).message}`,
        'AuthService',
      );
    }
  }

  // ─── CLERK OAUTH LOGIN ─────────────────────────────────────

  async clerkLogin(clerkToken: string): Promise<TokenResponse & { user: object }> {
    const secretKey = this.configService.clerk.secretKey;
    const clerkUserId = await this.verifyClerkSessionToken(clerkToken);

    // Repeat logins use the local profile keyed by Clerk's stable subject ID.
    // This avoids a Clerk Backend API request on every social login.
    const savedUser = await this.usersService.findByClerkId(clerkUserId);
    if (savedUser) {
      if (!savedUser.isActive || savedUser.accountType !== AccountType.BUYER) {
        throw new UnauthorizedException('This buyer account is unavailable');
      }
      return this.completeClerkLogin(savedUser);
    }

    // Fetch the profile only for first-time provisioning.
    if (!secretKey) {
      throw new UnauthorizedException('Clerk secret key is required to provision a buyer account');
    }
    const clerkClient = createClerkClient({ secretKey });
    let clerkUser;
    try {
      clerkUser = await clerkClient.users.getUser(clerkUserId);
    } catch {
      throw new UnauthorizedException('Unable to load the Clerk account profile');
    }

    const emailAddress = clerkUser.emailAddresses?.find(
      (candidate) => candidate.id === clerkUser.primaryEmailAddressId,
    );
    const verifiedEmail =
      emailAddress?.verification?.status === 'verified'
        ? emailAddress.emailAddress.trim().toLowerCase()
        : null;
    const phoneNumber = clerkUser.phoneNumbers?.find(
      (candidate) => candidate.id === clerkUser.primaryPhoneNumberId,
    );
    const verifiedPhone =
      phoneNumber?.verification?.status === 'verified' ? phoneNumber.phoneNumber : null;

    if (!verifiedEmail && !verifiedPhone) {
      throw new UnauthorizedException('Clerk account must have a verified email or phone number');
    }

    // Email equality is not proof that the buyer owns the existing Cadna
    // account. The buyer must authenticate to that account and link Clerk.
    const existingByEmail = verifiedEmail
      ? await this.usersService.findByEmail(verifiedEmail)
      : null;
    const deletedByClerkId = await this.usersService.findDeletedByClerkId(clerkUserId);
    const deletedByEmail = verifiedEmail
      ? await this.usersService.findDeletedByEmail(verifiedEmail)
      : null;
    const deletedEmailBelongsToAnotherUser =
      deletedByEmail && deletedByEmail._id.toString() !== deletedByClerkId?._id.toString();
    if (existingByEmail || deletedEmailBelongsToAnotherUser) {
      throw new ConflictException(
        'Sign in to your existing Cadna account first, then link this Clerk account',
      );
    }

    let user = deletedByClerkId;
    const identity = {
      clerkId: clerkUserId,
      email: verifiedEmail,
      phoneNumber: verifiedPhone,
      isPhoneVerified: !!verifiedPhone,
      firstName: clerkUser.firstName || 'User',
      lastName: clerkUser.lastName || '',
    };
    if (user) {
      user = await this.usersService.reactivateClerkUser(user._id.toString(), identity);
    } else {
      try {
        user = await this.usersService.createClerkBuyer(identity);
      } catch (error) {
        // A user.created webhook may have provisioned this same identity at
        // the same time. Re-read by Clerk ID before returning an error.
        if (!isPrismaUniqueConstraintError(error)) throw error;
        user = await this.usersService.findByClerkId(clerkUserId);
        if (!user && verifiedEmail && (await this.usersService.findByEmail(verifiedEmail))) {
          throw new ConflictException(
            'Sign in to your existing Cadna account first, then link this Clerk account',
          );
        }
        if (!user) throw error;
      }
    }

    if (!user) throw new UnauthorizedException('Failed to synchronize Clerk account');
    return this.completeClerkLogin(user);
  }

  async linkClerkIdentity(userId: string, clerkToken: string): Promise<{ message: string }> {
    const clerkUserId = await this.verifyClerkSessionToken(clerkToken);
    await this.usersService.linkClerkIdentity(userId, clerkUserId);
    return { message: 'Clerk sign-in linked to your Cadna account' };
  }

  private async verifyClerkSessionToken(clerkToken: string): Promise<string> {
    const secretKey = this.configService.clerk.secretKey;
    const jwtKey = this.configService.clerk.jwtKey;
    if (!secretKey && !jwtKey) {
      throw new UnauthorizedException('Clerk token verification is not configured');
    }
    try {
      const payload = await verifyToken(clerkToken, {
        jwtKey: jwtKey || undefined,
        secretKey: secretKey || undefined,
        authorizedParties: this.getClerkAuthorizedParties(),
      });
      return payload.sub;
    } catch {
      this.logger.warn('Clerk session token verification failed', 'AuthService');
      throw new UnauthorizedException('Invalid Clerk session token');
    }
  }

  private getClerkAuthorizedParties(): string[] | undefined {
    const origin = this.configService.cors.origin;
    if (Array.isArray(origin)) return origin;
    if (typeof origin === 'string' && origin !== '*') return [origin];
    if (this.configService.app.nodeEnv !== 'dev') {
      throw new UnauthorizedException(
        'Configure exact CORS_ORIGIN values before enabling Clerk sign-in outside development',
      );
    }
    return undefined;
  }

  private async completeClerkLogin(user: User): Promise<TokenResponse & { user: object }> {
    const userId = user._id.toString();
    const tokens = await this.issueTokens({
      userId,
      email: user.email,
      accountType: user.accountType,
      accountTypes: user.accountTypes,
    });

    await this.authEventsService.log(userId, AuthEventKind.CLERK_LOGIN);
    return {
      ...tokens,
      user: this.usersService.toPublicUser(user),
    };
  }

  // ─── TOKEN MANAGEMENT ───────────────────────────────────────

  async refreshTokens(refreshToken: string): Promise<TokenResponse> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.jwt.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException(ERROR_MESSAGES.INVALID_TOKEN);
    }

    let user;
    try {
      user = await this.usersService.findById(payload.sub);
    } catch {
      throw new UnauthorizedException(ERROR_MESSAGES.INVALID_TOKEN);
    }

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException(ERROR_MESSAGES.INVALID_TOKEN);
    }

    const isRefreshTokenValid = await comparePassword(refreshToken, user.refreshToken);
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException(ERROR_MESSAGES.INVALID_TOKEN);
    }

    const newPayload: JwtPayload = {
      sub: (user as unknown as { _id: { toString(): string } })._id.toString(),
      ...(user.email ? { email: user.email } : {}),
      accountType: user.accountType,
      accountTypes: user.accountTypes,
    };

    const tokens = await this.generateTokens(newPayload);

    const hashedRefreshToken = await hashPassword(tokens.refreshToken);
    await this.usersService.updateRefreshToken(payload.sub, hashedRefreshToken);
    await this.authEventsService.log(payload.sub, AuthEventKind.REFRESH);

    return tokens;
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.updateRefreshToken(userId, null);
    await this.authEventsService.log(userId, AuthEventKind.LOGOUT);
  }

  // ─── PRIVATE HELPERS ────────────────────────────────────────

  private async issueTokens(user: {
    userId: string;
    email: string | null;
    accountType: string;
    accountTypes?: AccountType[];
  }): Promise<TokenResponse> {
    const payload: JwtPayload = {
      sub: user.userId,
      ...(user.email ? { email: user.email } : {}),
      accountType: user.accountType as JwtPayload['accountType'],
      accountTypes: user.accountTypes ?? [user.accountType as AccountType],
    };

    const tokens = await this.generateTokens(payload);

    const hashedRefreshToken = await hashPassword(tokens.refreshToken);
    await this.usersService.updateRefreshToken(user.userId, hashedRefreshToken);
    await this.usersService.updateLastLogin(user.userId);

    return tokens;
  }

  private async generateTokens(payload: JwtPayload): Promise<TokenResponse> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload as unknown as Record<string, unknown>, {
        secret: this.configService.jwt.accessSecret,
        expiresIn: this.configService.jwt.accessExpiration as any,
      }),
      this.jwtService.signAsync(payload as unknown as Record<string, unknown>, {
        secret: this.configService.jwt.refreshSecret,
        expiresIn: this.configService.jwt.refreshExpiration as any,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.configService.jwt.accessExpiration,
    };
  }
}
