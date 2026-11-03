import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterEmailDto } from './dto/register-email.dto';
import { RegisterDetailsDto } from './dto/register-details.dto';
import { RegisterPasswordDto } from './dto/register-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import {
  ForgotPasswordDto,
  ForgotPasswordVerifyDto,
  ForgotPasswordResetDto,
} from './dto/forgot-password.dto';
import { Verify2faLoginDto, Enable2faDto } from './dto/verify-2fa.dto';
import { ClerkLoginDto } from './dto/clerk-login.dto';
import { OtpRequestDto, OtpVerifyDto, OtpResendDto, OtpPurpose } from './dto/otp.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { UsersService } from '@users/users.service';
import { AuthEventsService } from '@auth-events/auth-events.service';
import { AccountTypes } from './decorators/account-types.decorator';
import { AccountType } from '@users/enums/account-type.enum';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly authEventsService: AuthEventsService,
  ) {}

  // ─── MULTI-STEP REGISTRATION ─────────────────────────────────

  @Public()
  @Post('register/email')
  @ApiOperation({ summary: 'Step 1: Start registration with email' })
  async registerEmail(@Body() dto: RegisterEmailDto) {
    return this.authService.registerEmail(dto.email);
  }

  @Public()
  @Post('register/details')
  @ApiOperation({ summary: 'Step 2: Provide personal details' })
  async registerDetails(@Body() dto: RegisterDetailsDto) {
    return this.authService.registerDetails(dto.sessionId, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      dateOfBirth: dto.dateOfBirth,
      phoneNumber: dto.phoneNumber,
      termsAccepted: dto.termsAccepted,
    });
  }

  @Public()
  @Post('register/password')
  @ApiOperation({ summary: 'Step 3: Set password and create account' })
  async registerPassword(@Body() dto: RegisterPasswordDto) {
    return this.authService.registerPassword(dto.sessionId, dto.password, dto.confirmPassword);
  }

  @Public()
  @Post('register/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Step 4: Verify email with OTP code' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.email, dto.code);
  }

  @Public()
  @Post('register/resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend email verification OTP' })
  async resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendVerificationOtp(dto.email);
  }

  // ─── SINGLE-CALL REGISTRATION (spec alias) ──────────────────

  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Submit buyer signup details in one request and send an email verification code',
  })
  @ApiCreatedResponse({
    description:
      'Signup details are held in a temporary pending record; no buyer account is created until the email verification code is accepted. The caller should then hit /auth/otp/verify or /auth/register/verify.',
    schema: {
      example: {
        message: 'Signup saved. Please verify your email.',
        email: 'jane@example.com',
      },
    },
  })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // ─── GENERIC OTP (spec-aligned) ─────────────────────────────

  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send OTP via email for login/email-verification/password-reset',
  })
  @ApiOkResponse({
    description:
      'Channel is always email (Resend) regardless of "phone" wording in the PM spec. 60-second cooldown enforced by OtpService.',
    schema: { example: { message: 'Login code sent' } },
  })
  async otpRequest(@Body() dto: OtpRequestDto) {
    return this.authService.requestOtp(dto.email, dto.purpose ?? OtpPurpose.LOGIN);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Verify OTP code. Returns JWTs for login, message for verification, resetToken for password-reset',
  })
  @ApiOkResponse({
    description: 'Response shape depends on the `purpose` field on the request.',
    schema: {
      oneOf: [
        {
          description: 'purpose=login → returns JWT pair + user',
          example: {
            purpose: 'login',
            tokens: {
              accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
              refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
              expiresIn: '15m',
            },
            user: {
              id: '6710abc123def456789012ab',
              email: 'jane@example.com',
              accountType: 'BUYER',
            },
          },
        },
        {
          description: 'purpose=email_verification → success message',
          example: { purpose: 'email_verification', message: 'Email verified successfully' },
        },
        {
          description: 'purpose=password_reset → short-lived resetToken',
          example: {
            purpose: 'password_reset',
            resetToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          },
        },
      ],
    },
  })
  async otpVerify(@Body() dto: OtpVerifyDto) {
    return this.authService.verifyOtp(dto.email, dto.code, dto.purpose ?? OtpPurpose.LOGIN);
  }

  @Public()
  @Post('otp/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend OTP (cooldown enforced)' })
  @ApiOkResponse({ schema: { example: { message: 'Login code sent' } } })
  async otpResend(@Body() dto: OtpResendDto) {
    return this.authService.resendOtp(dto.email, dto.purpose ?? OtpPurpose.LOGIN);
  }

  // ─── LOGIN ───────────────────────────────────────────────────

  @Public()
  @Post('clerk/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login or register a buyer via Clerk using verified email, phone, or both',
  })
  @ApiOkResponse({
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        expiresIn: '15m',
        user: {
          id: '6710abc123def456789012ab',
          firstName: 'Jane',
          lastName: 'Doe',
          email: null,
          accountType: 'BUYER',
          phoneNumber: '+2348012345678',
          isEmailVerified: false,
          isPhoneVerified: true,
        },
      },
    },
  })
  async clerkLogin(@Body() dto: ClerkLoginDto) {
    return this.authService.clerkLogin(dto.token);
  }

  @AccountTypes(AccountType.BUYER)
  @ApiBearerAuth()
  @Post('clerk/link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Link a Clerk sign-in to the currently authenticated buyer account',
  })
  async linkClerkIdentity(@CurrentUser('userId') userId: string, @Body() dto: ClerkLoginDto) {
    return this.authService.linkClerkIdentity(userId, dto.token);
  }

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Login with email and password. For passwordless email-OTP login, use /auth/otp/request then /auth/otp/verify.',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({
    description: 'Returns JWT pair + user, or a requires2FA flag if 2FA is enabled.',
    schema: {
      oneOf: [
        {
          example: {
            accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            expiresIn: '15m',
            user: {
              id: '6710abc123def456789012ab',
              firstName: 'Jane',
              lastName: 'Doe',
              email: 'jane@example.com',
              accountType: 'BUYER',
              isVerified: true,
              isTwoFactorEnabled: false,
            },
          },
        },
        { example: { requires2FA: true, email: 'jane@example.com' } },
      ],
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials or unverified email.' })
  async login(@Req() req: Request) {
    const user = req.user as { userId: string; email: string; accountType: string };

    await new Promise<void>((resolve, reject) => {
      req.logIn(user, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const result = await this.authService.login(user);

    if ('requires2FA' in result) {
      return result;
    }

    const fullUser = await this.usersService.findById(user.userId);
    return {
      ...result,
      user: this.usersService.toPublicUser(fullUser),
    };
  }

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login/password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password (spec alias of /login)' })
  @ApiBody({ type: LoginDto })
  async loginPassword(@Req() req: Request) {
    return this.login(req);
  }

  @Public()
  @Post('login/verify-2fa')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify 2FA code during login' })
  async verifyLogin2fa(@Body() dto: Verify2faLoginDto) {
    const tokens = await this.authService.verifyLogin2fa(dto.email, dto.code);
    const user = await this.usersService.findByEmail(dto.email);
    return {
      ...tokens,
      user: user ? this.usersService.toPublicUser(user) : undefined,
    };
  }

  // ─── FORGOT PASSWORD ────────────────────────────────────────

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset OTP' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Post('password/reset/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset OTP (spec alias of /forgot-password)' })
  async passwordResetRequest(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Post('forgot-password/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify password reset OTP' })
  async forgotPasswordVerify(@Body() dto: ForgotPasswordVerifyDto) {
    return this.authService.forgotPasswordVerify(dto.email, dto.code);
  }

  @Public()
  @Post('forgot-password/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with reset token' })
  async forgotPasswordReset(@Body() dto: ForgotPasswordResetDto) {
    return this.authService.forgotPasswordReset(dto.resetToken, dto.password, dto.confirmPassword);
  }

  @Public()
  @Post('password/reset/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm password reset with token (spec alias of /forgot-password/reset)',
  })
  async passwordResetConfirm(@Body() dto: ForgotPasswordResetDto) {
    return this.authService.forgotPasswordReset(dto.resetToken, dto.password, dto.confirmPassword);
  }

  // ─── 2FA MANAGEMENT ─────────────────────────────────────────

  @ApiBearerAuth()
  @Post('password/change')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change the current local account password' })
  async changePassword(@CurrentUser('userId') userId: string, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(userId, dto);
  }

  @ApiBearerAuth()
  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate 2FA enable (sends OTP)' })
  async enable2fa(@CurrentUser('userId') userId: string) {
    return this.authService.initiate2faEnable(userId);
  }

  @ApiBearerAuth()
  @Post('2fa/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm 2FA enable with OTP' })
  async confirm2fa(@CurrentUser('userId') userId: string, @Body() dto: Enable2faDto) {
    return this.authService.confirm2faEnable(userId, dto.code);
  }

  @ApiBearerAuth()
  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable 2FA with OTP verification' })
  async disable2fa(@CurrentUser('userId') userId: string, @Body() dto: Enable2faDto) {
    return this.authService.disable2fa(userId, dto.code);
  }

  // ─── TOKEN & PROFILE ────────────────────────────────────────

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiOkResponse({
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        expiresIn: '15m',
      },
    },
  })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshTokens(refreshTokenDto.refreshToken);
  }

  @ApiBearerAuth()
  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiOkResponse({
    schema: {
      example: {
        id: '6710abc123def456789012ab',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        accountType: 'BUYER',
        phoneNumber: '+2348012345678',
        dateOfBirth: '1990-01-15T00:00:00.000Z',
        isEmailVerified: true,
        isVerified: true,
        isTwoFactorEnabled: false,
        marketingConsent: false,
        marketingConsentAt: null,
        createdAt: '2026-05-19T10:23:00.000Z',
        fullName: 'Jane Doe',
      },
    },
  })
  async getProfile(@CurrentUser('userId') userId: string) {
    const user = await this.usersService.findById(userId);
    return this.usersService.toPublicUser(user);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Get current user (spec alias of /profile)' })
  @ApiOkResponse({ description: 'Identical payload to GET /auth/profile.' })
  async getMe(@CurrentUser('userId') userId: string) {
    const user = await this.usersService.findById(userId);
    return this.usersService.toPublicUser(user);
  }

  @ApiBearerAuth()
  @Get('logs')
  @ApiOperation({ summary: 'List auth events for the current user (audit log)' })
  async getLogs(
    @CurrentUser('userId') userId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.authEventsService.listForUser(userId, +page, +limit);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and invalidate tokens' })
  async logout(@Req() req: Request, @CurrentUser('userId') userId: string) {
    await this.authService.logout(userId);

    await new Promise<void>((resolve, reject) => {
      req.logout((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    return { message: 'Logged out successfully' };
  }
}
