import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { User } from './schemas/user.schema';
import { hashPassword } from '@common/utils/hash.util';
import { ERROR_MESSAGES } from '@common/constants/error-messages.constants';
import { PaginatedResult } from '@common/interfaces/api-response.interface';
import { AccountType } from './enums/account-type.enum';
import { BuyerNotificationPreferences } from './schemas/user.schema';
import { hasAccountType } from '@auth/utils/account-types.util';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existing = await this.usersRepository.findByEmail(createUserDto.email);
    if (existing) {
      throw new ConflictException(ERROR_MESSAGES.USER_ALREADY_EXISTS);
    }

    const hashedPassword = await hashPassword(createUserDto.password);
    const { dateOfBirth, termsAccepted, ...rest } = createUserDto;
    return this.usersRepository.create({
      ...rest,
      accountTypes: [createUserDto.accountType],
      password: hashedPassword,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      termsAcceptedAt: termsAccepted ? new Date() : null,
    });
  }

  async createVerifiedBuyerFromPendingSignup(signup: {
    email: string;
    firstName: string;
    lastName: string;
    dateOfBirth?: Date | null;
    phoneNumber?: string | null;
    passwordHash: string;
    termsAccepted: boolean;
  }): Promise<User> {
    const email = signup.email.trim().toLowerCase();
    const existing = await this.usersRepository.findByEmail(email);
    if (existing) {
      throw new ConflictException(ERROR_MESSAGES.USER_ALREADY_EXISTS);
    }

    return this.usersRepository.create({
      email,
      firstName: signup.firstName,
      lastName: signup.lastName,
      dateOfBirth: signup.dateOfBirth ?? null,
      phoneNumber: signup.phoneNumber ?? null,
      password: signup.passwordHash,
      accountType: AccountType.BUYER,
      accountTypes: [AccountType.BUYER],
      isVerified: true,
      termsAcceptedAt: signup.termsAccepted ? new Date() : null,
    });
  }

  async findAll(query: UserQueryDto): Promise<PaginatedResult<User>> {
    return this.usersRepository.findAll(query);
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findByEmail(email);
  }

  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepository.findByEmailWithPassword(email);
  }

  async findByIdWithPassword(userId: string): Promise<User | null> {
    return this.usersRepository.findByIdWithPassword(userId);
  }

  async findByClerkId(clerkId: string): Promise<User | null> {
    return this.usersRepository.findByClerkId(clerkId);
  }

  async linkClerkIdentity(userId: string, clerkId: string): Promise<User> {
    const current = await this.findById(userId);
    if (!hasAccountType(current, AccountType.BUYER)) {
      throw new ConflictException('Only buyer accounts can link a Clerk identity');
    }
    if (current.clerkId === clerkId) return current;
    if (current.clerkId) {
      throw new ConflictException('This buyer account is already linked to another Clerk account');
    }

    let linkedUser: User | null;
    try {
      linkedUser = await this.usersRepository.linkClerkIdentity(userId, clerkId);
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      linkedUser = null;
    }
    if (linkedUser) return linkedUser;

    const existing = await this.usersRepository.findByClerkId(clerkId);
    if (existing) {
      throw new ConflictException('This Clerk account is already linked to another Cadna account');
    }
    throw new ConflictException('Could not link this Clerk account. Please retry.');
  }

  async findDeletedByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findDeletedByEmail(email);
  }

  async findDeletedByClerkId(clerkId: string): Promise<User | null> {
    return this.usersRepository.findDeletedByClerkId(clerkId);
  }

  async createClerkBuyer(data: {
    clerkId: string;
    email: string | null;
    phoneNumber: string | null;
    isPhoneVerified: boolean;
    firstName: string;
    lastName: string;
  }): Promise<User> {
    return this.usersRepository.createClerkBuyer(data);
  }

  async syncClerkIdentity(
    userId: string,
    data: {
      clerkId: string;
      email: string | null;
      phoneNumber: string | null;
      isPhoneVerified: boolean;
      firstName: string;
      lastName: string;
    },
  ): Promise<User> {
    const user = await this.usersRepository.syncClerkIdentity(userId, data);
    if (!user) throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    return user;
  }

  async reactivateClerkUser(
    userId: string,
    data: {
      clerkId: string;
      email: string | null;
      phoneNumber: string | null;
      isPhoneVerified: boolean;
      firstName: string;
      lastName: string;
    },
  ): Promise<User> {
    const user = await this.usersRepository.reactivateClerkUser(userId, data);
    if (!user) throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const { dateOfBirth, ...updates } = updateUserDto;
    const user = await this.usersRepository.update(id, {
      ...updates,
      ...(dateOfBirth !== undefined
        ? { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null }
        : {}),
    });
    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    }
    return user;
  }

  async remove(id: string): Promise<User> {
    const user = await this.usersRepository.softDelete(id);
    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    }
    return user;
  }

  async updateRefreshToken(userId: string, refreshToken: string | null): Promise<void> {
    await this.usersRepository.updateRefreshToken(userId, refreshToken);
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.usersRepository.updateLastLogin(userId);
  }

  async verifyUser(userId: string): Promise<void> {
    await this.usersRepository.verifyUser(userId);
  }

  async setTwoFactor(userId: string, enabled: boolean): Promise<void> {
    await this.usersRepository.setTwoFactor(userId, enabled);
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await this.usersRepository.updatePassword(userId, hashedPassword);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    const updates: Partial<User> = {};
    if (dto.firstName !== undefined) updates.firstName = dto.firstName;
    if (dto.lastName !== undefined) updates.lastName = dto.lastName;
    // Clerk is the source of truth for verified email and phone changes.
    if (dto.phoneNumber !== undefined) {
      throw new ConflictException('Update your phone number through Clerk verification');
    }
    if (dto.dateOfBirth !== undefined) {
      updates.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    }
    if (dto.gender !== undefined) updates.gender = dto.gender;
    const user = await this.usersRepository.update(userId, updates as any);
    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    }
    if (
      dto.firstName !== undefined ||
      dto.lastName !== undefined ||
      dto.dateOfBirth !== undefined
    ) {
      await this.usersRepository.invalidateSellerKycAfterIdentityChange(userId);
    }
    return user;
  }

  async updateAvatar(userId: string, avatarUrl: string, avatarPublicId: string): Promise<User> {
    const user = await this.usersRepository.update(userId, {
      avatarUrl,
      avatarPublicId,
    } as Partial<User>);
    if (!user) throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    return user;
  }

  async setMarketingConsent(userId: string, optIn: boolean): Promise<User> {
    const user = await this.usersRepository.setMarketingConsent(userId, optIn);
    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    }
    return user;
  }

  async updateNotificationPreferences(
    userId: string,
    updates: Partial<BuyerNotificationPreferences>,
  ): Promise<BuyerNotificationPreferences> {
    const user = await this.findById(userId);
    const preferences: BuyerNotificationPreferences = {
      orderUpdates: updates.orderUpdates ?? user.notificationPreferences?.orderUpdates ?? true,
      promotions: updates.promotions ?? user.notificationPreferences?.promotions ?? false,
      newsletter: updates.newsletter ?? user.notificationPreferences?.newsletter ?? false,
      securityAlerts:
        updates.securityAlerts ?? user.notificationPreferences?.securityAlerts ?? true,
      supportUpdates:
        updates.supportUpdates ?? user.notificationPreferences?.supportUpdates ?? true,
    };
    const saved = await this.usersRepository.updateNotificationPreferences(userId, preferences);
    if (!saved) throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    return preferences;
  }

  async getNotificationPreferences(userId: string): Promise<BuyerNotificationPreferences> {
    const user = await this.findById(userId);
    return (
      user.notificationPreferences ?? {
        orderUpdates: true,
        promotions: false,
        newsletter: false,
        securityAlerts: true,
        supportUpdates: true,
      }
    );
  }

  async setActive(userId: string, isActive: boolean): Promise<User> {
    const user = await this.usersRepository.update(userId, { isActive } as Partial<User>);
    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    }
    return user;
  }

  toPublicUser(user: User) {
    return {
      id: (user as unknown as { id?: string }).id ?? user._id.toString(),
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      accountType: user.accountType,
      accountTypes: user.accountTypes ?? [user.accountType],
      phoneNumber: user.phoneNumber,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender ?? null,
      avatarUrl: user.avatarUrl ?? null,
      notificationPreferences: user.notificationPreferences,
      isEmailVerified: !!user.email && user.isVerified,
      isVerified: user.isVerified, // Backward compatibility for existing clients
      isPhoneVerified: user.isPhoneVerified,
      isTwoFactorEnabled: user.isTwoFactorEnabled,
      marketingConsent: !!user.marketingConsentAt,
      marketingConsentAt: user.marketingConsentAt,
      createdAt: user.createdAt,
      fullName: (user as unknown as { fullName?: string }).fullName,
    };
  }
}
