import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { SellersService } from '@sellers/sellers.service';
import { SellersRepository } from '@sellers/sellers.repository';
import { UpdateSellerDto } from '@sellers/dto/update-seller.dto';
import { PrismaService } from '@database/prisma.service';
import { ParsePublicIdPipe } from '@common/pipes/parse-public-id.pipe';
import {
  RejectSellerApplicationDto,
  RequestSellerApplicationInformationDto,
} from '@sellers/dto/review-seller-application.dto';
import {
  SellerApplicantType,
  SellerApplicationStatus,
  SellerDocumentType,
} from '@sellers/schemas/seller-profile.schema';
import { createPublicId } from '@database/id.util';
import { DataRequestsService } from '@data-requests/data-requests.service';

@ApiTags('Admin — Sellers')
@ApiBearerAuth()
@AccountTypes(AccountType.ADMIN)
@Controller('admin/sellers')
export class AdminSellersController {
  constructor(
    private readonly sellersService: SellersService,
    private readonly sellersRepository: SellersRepository,
    private readonly prisma: PrismaService,
    private readonly dataRequestsService: DataRequestsService,
  ) {}

  @Get('applications')
  @ApiOperation({
    summary: 'List seller onboarding applications with profile, banking, and approval status',
  })
  async findApplications(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('approval') approval?: 'pending' | 'approved',
    @Query('status') status?: SellerApplicationStatus,
  ) {
    const where: any = { deletedAt: null };
    if (status) where.applicationStatus = status;
    else if (approval === 'pending') where.applicationStatus = SellerApplicationStatus.PENDING;
    else if (approval === 'approved') where.applicationStatus = SellerApplicationStatus.APPROVED;

    const skip = (+page - 1) * +limit;
    const [profiles, totalItems] = await Promise.all([
      this.prisma.sellerProfile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: +limit,
        include: {
          user: { include: { seller: true } },
          documents: {
            where: { deletedAt: null },
            select: {
              id: true,
              documentType: true,
              originalFileName: true,
              contentType: true,
              sizeBytes: true,
              createdAt: true,
            },
          },
          kycChecks: {
            orderBy: { checkedAt: 'desc' },
            take: 10,
            select: {
              provider: true,
              mode: true,
              checkType: true,
              status: true,
              providerCode: true,
              nameMatch: true,
              checkedAt: true,
            },
          },
        },
      }),
      this.prisma.sellerProfile.count({ where }),
    ]);

    const items = profiles.map((profile: any) => {
      const ownerId = profile.user?.id;
      const storefront = profile.user?.seller;

      return {
        user: profile.user
          ? {
              id: ownerId,
              firstName: profile.user.firstName,
              lastName: profile.user.lastName,
              email: profile.user.email,
              accountType: profile.user.accountType,
              isVerified: profile.user.isVerified,
              isActive: profile.user.isActive,
            }
          : null,
        sellerProfile: {
          businessName: profile.businessName,
          businessRegistrationNumber: profile.businessRegistrationNumber,
          businessAddress: profile.businessAddress,
          businessType: profile.businessType,
          applicantType: profile.applicantType,
          applicationStatus: profile.applicationStatus,
          kycStatus: profile.kycStatus,
          kycIdType: profile.kycIdType,
          kycIdNumberLast4: profile.kycIdNumberLast4,
          kycNameMatch: profile.kycNameMatch,
          kycProviderMode: profile.kycProviderMode,
          kycLastCheckAt: profile.kycLastCheckAt,
          kycFailureCode: profile.kycFailureCode,
          kycChecks: profile.kycChecks,
          approvalMethod: profile.approvalMethod,
          submittedAt: profile.submittedAt,
          reviewReason: profile.reviewReason,
          requestedDocumentTypes: profile.requestedDocumentTypes,
          documents: profile.documents,
          bankName: profile.bankName,
          bankAccountName: profile.bankAccountName,
          bankAccountNumberMasked: profile.bankAccountNumber
            ? `${'*'.repeat(Math.max(10 - (profile.bankAccountNumberLast4?.length ?? 4), 0))}${profile.bankAccountNumberLast4 ?? profile.bankAccountNumber.slice(-4)}`
            : null,
          bankDetailsCompletedAt: profile.bankDetailsCompletedAt,
          isApproved: profile.isApproved,
          approvedAt: profile.approvedAt,
          createdAt: profile.createdAt,
        },
        storefront: storefront
          ? {
              id: storefront.id,
              name: storefront.name,
              slug: storefront.slug,
              isVerified: storefront.isVerified,
              isActive: storefront.isActive,
            }
          : null,
      };
    });

    return {
      items,
      pagination: {
        page: +page,
        limit: +limit,
        totalItems,
        totalPages: Math.ceil(totalItems / +limit),
      },
    };
  }

  @Get('applications/documents/:documentId/download')
  @ApiOperation({
    summary: 'Create a 60-second private download URL for a seller application document',
  })
  async getApplicationDocumentDownloadUrl(
    @Param('documentId', ParsePublicIdPipe) documentId: string,
  ) {
    return this.sellersService.getAdminDocumentDownloadUrl(documentId);
  }

  @Get()
  @ApiOperation({ summary: 'List all sellers with profile and approval status' })
  async findAll(@Query('page') page = 1, @Query('limit') limit = 20) {
    const skip = (+page - 1) * +limit;
    const [items, totalItems] = await Promise.all([
      this.prisma.seller.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip,
        take: +limit,
        include: { owner: { include: { sellerProfile: true } } },
      }),
      this.prisma.seller.count({ where: { deletedAt: null } }),
    ]);

    const enrichedItems = items.map((seller: any) => {
      const profile = seller.owner?.sellerProfile;
      return {
        ...seller,
        _id: seller.id,
        owner: seller.owner ? { ...seller.owner, _id: seller.owner.id } : null,
        sellerProfile: profile
          ? {
              businessName: profile.businessName,
              businessRegistrationNumber: profile.businessRegistrationNumber,
              businessAddress: profile.businessAddress,
              businessType: profile.businessType,
              bankName: profile.bankName,
              isApproved: profile.isApproved,
              approvedAt: profile.approvedAt,
            }
          : null,
      };
    });

    return {
      items: enrichedItems,
      pagination: {
        page: +page,
        limit: +limit,
        totalItems,
        totalPages: Math.ceil(totalItems / +limit),
      },
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update any seller' })
  async update(
    @Param('id', ParsePublicIdPipe) id: string,
    @Body() dto: UpdateSellerDto,
    @CurrentUser() user: { userId: string; accountType: string },
  ) {
    return this.sellersService.updateMySeller(dto, user, id);
  }

  @Patch(':id/verify')
  @ApiOperation({ summary: 'Toggle seller verified status' })
  async toggleVerify(
    @Param('id', ParsePublicIdPipe) id: string,
    @Body('isVerified') isVerified: boolean,
  ) {
    return this.sellersRepository.update(id, { isVerified } as any);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve a seller to upload products' })
  async approve(
    @Param('id', ParsePublicIdPipe) sellerId: string,
    @CurrentUser('userId') adminUserId: string,
  ) {
    return this.approveSeller(sellerId, adminUserId);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a seller (spec-aligned POST alias of PATCH /:id/approve)' })
  async approvePost(
    @Param('id', ParsePublicIdPipe) sellerId: string,
    @CurrentUser('userId') adminUserId: string,
  ) {
    return this.approveSeller(sellerId, adminUserId);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject a seller application or revoke seller approval with a reason' })
  async reject(
    @Param('id', ParsePublicIdPipe) sellerId: string,
    @CurrentUser('userId') adminUserId: string,
    @Body() dto: RejectSellerApplicationDto,
  ) {
    return this.rejectSeller(sellerId, adminUserId, dto.reason);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject seller (spec-aligned POST alias of PATCH /:id/reject)' })
  async rejectPost(
    @Param('id', ParsePublicIdPipe) sellerId: string,
    @CurrentUser('userId') adminUserId: string,
    @Body() dto: RejectSellerApplicationDto,
  ) {
    return this.rejectSeller(sellerId, adminUserId, dto.reason);
  }

  @Patch('applications/:userId/approve')
  @ApiOperation({ summary: 'Approve a seller application by owner user id' })
  async approveApplication(
    @Param('userId', ParsePublicIdPipe) userId: string,
    @CurrentUser('userId') adminUserId: string,
  ) {
    return this.approveSellerProfile(userId, adminUserId);
  }

  @Post('applications/:userId/approve')
  @ApiOperation({
    summary: 'Approve a seller application by owner user id (spec-aligned POST alias)',
  })
  async approveApplicationPost(
    @Param('userId', ParsePublicIdPipe) userId: string,
    @CurrentUser('userId') adminUserId: string,
  ) {
    return this.approveSellerProfile(userId, adminUserId);
  }

  @Patch('applications/:userId/reject')
  @ApiOperation({ summary: 'Reject / revoke a seller application by owner user id' })
  async rejectApplication(
    @Param('userId', ParsePublicIdPipe) userId: string,
    @CurrentUser('userId') adminUserId: string,
    @Body() dto: RejectSellerApplicationDto,
  ) {
    return this.rejectSellerProfile(userId, adminUserId, dto.reason);
  }

  @Post('applications/:userId/reject')
  @ApiOperation({
    summary: 'Reject / revoke a seller application by owner user id (spec-aligned POST alias)',
  })
  async rejectApplicationPost(
    @Param('userId', ParsePublicIdPipe) userId: string,
    @CurrentUser('userId') adminUserId: string,
    @Body() dto: RejectSellerApplicationDto,
  ) {
    return this.rejectSellerProfile(userId, adminUserId, dto.reason);
  }

  @Patch('applications/:userId/more-information')
  @ApiOperation({ summary: 'Pause an application and tell the applicant what to update' })
  async requestApplicationInformation(
    @Param('userId', ParsePublicIdPipe) userId: string,
    @CurrentUser('userId') adminUserId: string,
    @Body() dto: RequestSellerApplicationInformationDto,
  ) {
    return this.transitionSellerApplication(userId, adminUserId, {
      toStatus: SellerApplicationStatus.MORE_INFORMATION_NEEDED,
      reason: dto.reason,
      requestedDocumentTypes: dto.requestedDocumentTypes ?? [],
    });
  }

  private async approveSeller(sellerId: string, adminUserId: string) {
    const ownerUserId = await this.resolveSellerProfileUserId(sellerId);
    return this.approveSellerProfile(ownerUserId, adminUserId);
  }

  private async approveSellerProfile(userId: string, adminUserId: string) {
    const existing = await this.prisma.sellerProfile.findFirst({
      where: { userId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Seller application not found');
    if (existing.applicationStatus !== SellerApplicationStatus.PENDING) {
      throw new BadRequestException('Only submitted applications can be approved');
    }
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user?.isVerified) throw new BadRequestException('Applicant email must be verified');
    const requiredTypes =
      existing.applicantType === SellerApplicantType.INDIVIDUAL
        ? [[SellerDocumentType.GOVERNMENT_ID, SellerDocumentType.GOVERNMENT_ID_FRONT]]
        : [
            [SellerDocumentType.CAC_REGISTRATION],
            [SellerDocumentType.OWNER_ID],
            [SellerDocumentType.GOVERNMENT_ID_FRONT, SellerDocumentType.GOVERNMENT_ID],
          ];
    const documents = await this.prisma.sellerApplicationDocument.findMany({
      where: { sellerProfileId: existing.id, deletedAt: null },
      select: { documentType: true },
    });
    if (
      requiredTypes.some(
        (alternatives) =>
          !alternatives.some((type) =>
            documents.some((document) => document.documentType === type),
          ),
      )
    ) {
      throw new BadRequestException('Required seller identity documents are missing');
    }
    if (!existing.bankVerifiedAt || !existing.bankVerificationProvider) {
      throw new BadRequestException('Payout account must be verified before approval');
    }

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.sellerProfile.update({
        where: { id: existing.id },
        data: {
          applicationStatus: SellerApplicationStatus.APPROVED,
          isApproved: true,
          approvedAt: now,
          approvedById: adminUserId,
          approvalMethod: 'manual',
          reviewedAt: now,
          reviewedById: adminUserId,
          reviewReason: null,
          requestedDocumentTypes: [],
        },
      });
      await tx.sellerApplicationReview.create({
        data: {
          id: createPublicId(),
          sellerProfileId: existing.id,
          actorId: adminUserId,
          fromStatus: existing.applicationStatus,
          toStatus: SellerApplicationStatus.APPROVED,
        },
      });
      const accountTypes = user.accountTypes.length ? user.accountTypes : [user.accountType];
      if (!accountTypes.includes(AccountType.SELLER)) accountTypes.push(AccountType.SELLER);
      await tx.user.update({ where: { id: userId }, data: { accountTypes } });
      await tx.seller.updateMany({
        where: { ownerId: userId, deletedAt: null },
        data: { isActive: true },
      });
    });
    return { message: 'Seller approved', applicationStatus: SellerApplicationStatus.APPROVED };
  }

  private async rejectSeller(sellerId: string, adminUserId: string, reason: string) {
    const ownerUserId = await this.resolveSellerProfileUserId(sellerId);
    return this.rejectSellerProfile(ownerUserId, adminUserId, reason);
  }

  private async rejectSellerProfile(userId: string, adminUserId: string, reason: string) {
    const existing = await this.prisma.sellerProfile.findFirst({
      where: { userId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Seller application not found');
    if (!adminUserId) throw new BadRequestException('Reviewer identity is required');
    return this.transitionSellerApplication(userId, adminUserId, {
      toStatus: SellerApplicationStatus.REJECTED,
      reason,
      requestedDocumentTypes: [],
    });
  }

  private async transitionSellerApplication(
    userId: string,
    adminUserId: string,
    decision: {
      toStatus: SellerApplicationStatus.MORE_INFORMATION_NEEDED | SellerApplicationStatus.REJECTED;
      reason: string;
      requestedDocumentTypes: SellerDocumentType[];
    },
  ) {
    const existing = await this.prisma.sellerProfile.findFirst({
      where: { userId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Seller application not found');
    const reviewableStatuses = [
      SellerApplicationStatus.PENDING,
      SellerApplicationStatus.MORE_INFORMATION_NEEDED,
      ...(decision.toStatus === SellerApplicationStatus.REJECTED
        ? [SellerApplicationStatus.APPROVED]
        : []),
    ];
    if (!reviewableStatuses.includes(existing.applicationStatus as SellerApplicationStatus)) {
      throw new BadRequestException('Only submitted applications can be reviewed');
    }
    if (decision.toStatus === SellerApplicationStatus.REJECTED) {
      await this.dataRequestsService.deleteSellerApplicationDocuments(userId);
    }
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.sellerProfile.update({
        where: { id: existing.id },
        data: {
          applicationStatus: decision.toStatus,
          isApproved: false,
          approvedAt: null,
          approvedById: null,
          reviewedAt: now,
          reviewedById: adminUserId,
          reviewReason: decision.reason,
          requestedDocumentTypes: decision.requestedDocumentTypes,
        },
      });
      await tx.sellerApplicationReview.create({
        data: {
          id: createPublicId(),
          sellerProfileId: existing.id,
          actorId: adminUserId,
          fromStatus: existing.applicationStatus,
          toStatus: decision.toStatus,
          reason: decision.reason,
          requestedDocumentTypes: decision.requestedDocumentTypes,
        },
      });
      if (decision.toStatus === SellerApplicationStatus.REJECTED) {
        await tx.seller.updateMany({
          where: { ownerId: userId, deletedAt: null },
          data: { isActive: false },
        });
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (user) {
          const remainingTypes = user.accountTypes.filter((type) => type !== AccountType.SELLER);
          // Legacy seller-only accounts still need a usable buyer role after rejection.
          if (remainingTypes.length === 0) remainingTypes.push(AccountType.BUYER);
          await tx.user.update({
            where: { id: userId },
            data: { accountTypes: remainingTypes },
          });
        }
      }
    });
    return {
      message: 'Seller application reviewed',
      applicationStatus: decision.toStatus,
      reason: decision.reason,
    };
  }

  private async resolveSellerProfileUserId(subjectId: string) {
    const seller = await this.sellersRepository.findById(subjectId);
    const ownerId = (seller as any)?.owner?.toString?.();
    return ownerId ?? subjectId;
  }
}
