import { Injectable } from '@nestjs/common';
import { Prisma, User as PrismaUser } from '../generated/prisma/client';
import { PrismaService } from '@database/prisma.service';
import { createPublicId } from '@database/id.util';
import { User } from './schemas/user.schema';
import { AuthProvider } from './enums/auth-provider.enum';
import { AccountType } from './enums/account-type.enum';
import { UserQueryDto } from './dto/user-query.dto';
import { PaginatedResult } from '@common/interfaces/api-response.interface';

function toUser(row: PrismaUser, includePassword = false): User {
  const { id, password, ...safeFields } = row;
  return {
    ...safeFields,
    id,
    _id: id,
    accountTypes: row.accountTypes?.length > 0 ? row.accountTypes : [row.accountType],
    fullName: `${row.firstName} ${row.lastName}`,
    ...(includePassword ? { password } : {}),
    // These properties have sensitive database-only semantics and stay hidden in
    // ordinary reads. refreshToken is also removed by the existing JSON transform.
    refreshToken: null,
    avatarPublicId: null,
  } as unknown as User;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async findOne(where: Prisma.UserWhereInput): Promise<User | null> {
    const row = await this.prisma.user.findFirst({ where });
    return row ? toUser(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    return this.findOne({ id, deletedAt: null });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.findOne({ email: email.toLowerCase(), deletedAt: null });
  }

  async findByEmailWithPassword(email: string): Promise<User | null> {
    const row = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
    });
    return row ? toUser(row, true) : null;
  }

  async findByIdWithPassword(userId: string): Promise<User | null> {
    const row = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    return row ? toUser(row, true) : null;
  }

  async create(data: Partial<User>): Promise<User> {
    const row = await this.prisma.user.create({
      data: {
        ...(data as Prisma.UserUncheckedCreateInput),
        id: createPublicId(),
        ...(data.email ? { email: data.email.toLowerCase().trim() } : {}),
      },
    });
    return toUser(row);
  }

  async update(id: string, data: Partial<User>): Promise<User | null> {
    const update = await this.prisma.user.updateMany({
      where: { id, deletedAt: null },
      data: data as Prisma.UserUncheckedUpdateManyInput,
    });
    if (update.count === 0) return null;
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? toUser(row) : null;
  }

  async invalidateSellerKycAfterIdentityChange(userId: string): Promise<void> {
    await this.prisma.sellerProfile.updateMany({
      where: {
        userId,
        applicationStatus: { in: ['draft', 'more_information_needed', 'rejected'] },
      },
      data: {
        kycStatus: 'not_started',
        kycIdType: null,
        kycIdNumberEncrypted: null,
        kycIdNumberLast4: null,
        kycApplicantFingerprint: null,
        kycProviderMode: null,
        kycVerifiedAt: null,
        kycLastCheckAt: null,
        kycFailureCode: null,
        kycNameMatch: null,
        bankVerifiedAt: null,
        bankDetailsCompletedAt: null,
      },
    });
    await this.prisma.sellerProfile.updateMany({
      where: { userId, applicationStatus: 'pending' },
      data: {
        kycStatus: 'review_required',
        kycFailureCode: 'APPLICANT_DETAILS_CHANGED_AFTER_SUBMISSION',
      },
    });
  }

  async softDelete(id: string): Promise<User | null> {
    return this.update(id, { deletedAt: new Date() } as Partial<User>);
  }

  async findAll(query: UserQueryDto): Promise<PaginatedResult<User>> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const sort = query.sort || 'createdAt';
    const order = query.order === 'asc' ? 'asc' : 'desc';
    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (query.accountType) where.accountType = query.accountType;
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { [sort]: order } as Prisma.UserOrderByWithRelationInput,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return {
      data: rows.map((row) => toUser(row)),
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async updateRefreshToken(userId: string, refreshToken: string | null): Promise<void> {
    await this.prisma.user.updateMany({ where: { id: userId }, data: { refreshToken } });
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.prisma.user.updateMany({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  }

  findByClerkId(clerkId: string): Promise<User | null> {
    return this.findOne({ clerkId, deletedAt: null });
  }

  async linkClerkIdentity(userId: string, clerkId: string): Promise<User | null> {
    const result = await this.prisma.user.updateMany({
      where: { id: userId, accountType: AccountType.BUYER, deletedAt: null, clerkId: null },
      data: { clerkId },
    });
    if (result.count === 0) return null;
    return this.findById(userId);
  }

  async findDeletedByEmail(email: string): Promise<User | null> {
    return this.findOne({ email: email.toLowerCase(), deletedAt: { not: null } });
  }

  async findDeletedByClerkId(clerkId: string): Promise<User | null> {
    return this.findOne({ clerkId, deletedAt: { not: null } });
  }

  createClerkBuyer(data: {
    clerkId: string;
    email: string | null;
    phoneNumber: string | null;
    isPhoneVerified: boolean;
    firstName: string;
    lastName: string;
  }): Promise<User> {
    return this.create({
      ...data,
      password: null,
      accountType: AccountType.BUYER,
      accountTypes: [AccountType.BUYER],
      authProvider: AuthProvider.CLERK,
      isVerified: true,
    } as Partial<User>);
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
  ): Promise<User | null> {
    return this.update(userId, { ...data, isVerified: true } as Partial<User>);
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
  ): Promise<User | null> {
    const row = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...data,
        authProvider: AuthProvider.CLERK,
        isVerified: true,
        isActive: true,
        deletedAt: null,
      },
    });
    return toUser(row);
  }

  async verifyUser(userId: string): Promise<void> {
    await this.prisma.user.updateMany({ where: { id: userId }, data: { isVerified: true } });
  }

  async setTwoFactor(userId: string, enabled: boolean): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: userId },
      data: { isTwoFactorEnabled: enabled },
    });
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: userId },
      data: { password: hashedPassword },
    });
  }

  async setMarketingConsent(userId: string, optIn: boolean): Promise<User | null> {
    const result = await this.prisma.user.updateMany({
      where: { id: userId },
      data: { marketingConsentAt: optIn ? new Date() : null },
    });
    return result.count ? this.findById(userId) : null;
  }

  async updateNotificationPreferences(
    userId: string,
    preferences: User['notificationPreferences'],
  ): Promise<User | null> {
    const result = await this.prisma.user.updateMany({
      where: { id: userId },
      data: { notificationPreferences: preferences as unknown as Prisma.InputJsonValue },
    });
    return result.count ? this.findById(userId) : null;
  }
}
