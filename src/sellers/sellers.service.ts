import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { createPublicId } from '@database/id.util';
import { isPrismaUniqueConstraintError } from '@database/prisma-errors';
import { SellersRepository } from './sellers.repository';
import { CreateSellerDto } from './dto/create-seller.dto';
import { UpdateSellerDto } from './dto/update-seller.dto';
import { BankingDetailsDto } from './dto/banking-details.dto';
import { AccountType } from '@users/enums/account-type.enum';
import { Product } from '@products/schemas/product.schema';
import { Seller } from './schemas/seller.schema';
import { UsersService } from '@users/users.service';
import { ProductsService } from '@products/products.service';
import { SaveSellerApplicationDto } from './dto/save-seller-application.dto';
import {
  SellerApplicantType,
  SellerApplicationStatus,
  SellerDocumentType,
  SellerKycStatus,
  BusinessType,
} from './schemas/seller-profile.schema';
import { hasAccountType } from '@auth/utils/account-types.util';
import { SellerBankingService } from './seller-banking.service';
import { SellerPiiService } from './seller-pii.service';
import { UploadService } from '@upload/upload.service';
import { CreateMyProductDto } from './dto/create-my-product.dto';
import { UpdateProductDto } from '@products/dto/update-product.dto';
import { ProductQueryDto } from '@products/dto/product-query.dto';
import { SubmitSellerKycDto } from './dto/submit-seller-kyc.dto';
import { ConfirmPickupAddressDto } from './dto/confirm-pickup-address.dto';
import { SellerKycProviderService, SellerKycIdType } from './seller-kyc-provider.service';

@Injectable()
export class SellersService {
  constructor(
    private readonly sellersRepository: SellersRepository,
    private readonly usersService: UsersService,
    private readonly productsService: ProductsService,
    private readonly sellerBankingService: SellerBankingService,
    private readonly sellerPiiService: SellerPiiService,
    private readonly uploadService: UploadService,
    private readonly sellerKycProvider: SellerKycProviderService,
  ) {}

  async getMyApplication(userId: string): Promise<object | null> {
    const profile = await this.sellersRepository.prisma.sellerProfile.findFirst({
      where: { userId, deletedAt: null },
      include: {
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
        reviewHistory: {
          orderBy: { createdAt: 'desc' },
          select: {
            fromStatus: true,
            toStatus: true,
            reason: true,
            requestedDocumentTypes: true,
            createdAt: true,
          },
        },
      },
    });
    if (!profile) return null;
    return {
      id: profile.id,
      applicantType: profile.applicantType,
      businessName: profile.businessName,
      businessRegistrationNumber: profile.businessRegistrationNumber,
      businessAddress: profile.businessAddress,
      businessType: profile.businessType,
      applicationStatus: profile.applicationStatus,
      kyc: {
        status: profile.kycStatus,
        idType: profile.kycIdType,
        idNumberLast4: profile.kycIdNumberLast4,
        consentRecorded: Boolean(profile.kycConsentAt),
        checkedAt: profile.kycLastCheckAt,
        verifiedAt: profile.kycVerifiedAt,
      },
      submittedAt: profile.submittedAt,
      reviewReason: profile.reviewReason,
      requestedDocumentTypes: profile.requestedDocumentTypes,
      documents: profile.documents,
      reviewHistory: profile.reviewHistory,
      bank: {
        bankName: profile.bankName,
        accountName: profile.bankAccountName,
        accountNumberMasked: this.maskAccountNumber(
          profile.bankAccountNumber,
          profile.bankAccountNumberLast4,
        ),
        verifiedAt: profile.bankVerifiedAt,
      },
    };
  }

  async listSellerBanks() {
    return { items: await this.sellerBankingService.listBanks() };
  }

  async verifyMyApplicationKyc(userId: string, dto: SubmitSellerKycDto): Promise<object> {
    const [user, profile] = await Promise.all([
      this.usersService.findById(userId),
      this.sellersRepository.prisma.sellerProfile.findFirst({
        where: { userId, deletedAt: null },
        include: { documents: { where: { deletedAt: null }, select: { documentType: true } } },
      }),
    ]);
    if (!user.isVerified || !user.email) {
      throw new ForbiddenException('Verify your email before submitting identity verification');
    }
    if (!profile) throw new NotFoundException('Seller application not found');
    if (
      ![
        SellerApplicationStatus.DRAFT,
        SellerApplicationStatus.MORE_INFORMATION_NEEDED,
        SellerApplicationStatus.REJECTED,
      ].includes(profile.applicationStatus as SellerApplicationStatus)
    ) {
      throw new ConflictException(
        'Identity details cannot be changed while the application is under review',
      );
    }
    if (dto.consentGiven !== true)
      throw new BadRequestException('Consent is required for identity verification');

    const documentTypes = profile.documents.map((document) => document.documentType);
    const hasIdentityImage =
      documentTypes.includes(SellerDocumentType.GOVERNMENT_ID_FRONT) ||
      documentTypes.includes(SellerDocumentType.GOVERNMENT_ID) ||
      (profile.applicantType === SellerApplicantType.REGISTERED_BUSINESS &&
        documentTypes.includes(SellerDocumentType.OWNER_ID));
    if (!hasIdentityImage) {
      throw new BadRequestException('Upload the front of your government ID before verification');
    }
    if (dto.idType === 'drivers_license' && !user.dateOfBirth) {
      throw new BadRequestException('Date of birth is required to verify a driver’s licence');
    }

    const checkedAt = new Date();
    const consentAt = checkedAt;
    const encryptedIdNumber = this.sellerPiiService.encryptGovernmentIdNumber(dto.idNumber);
    const applicantFingerprint = this.sellerPiiService.fingerprintSellerIdentity(
      user.firstName,
      user.lastName,
      user.dateOfBirth,
    );
    const checkId = createPublicId();
    const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
    const claimed = await this.sellersRepository.prisma.$transaction(async (tx) => {
      const claim = await tx.sellerProfile.updateMany({
        where: {
          id: profile.id,
          applicationStatus: {
            in: [
              SellerApplicationStatus.DRAFT,
              SellerApplicationStatus.MORE_INFORMATION_NEEDED,
              SellerApplicationStatus.REJECTED,
            ],
          },
          OR: [
            { kycStatus: { not: SellerKycStatus.PENDING } },
            { kycStatus: SellerKycStatus.PENDING, kycLastCheckAt: { lt: staleBefore } },
          ],
        },
        data: {
          kycStatus: SellerKycStatus.PENDING,
          kycIdType: dto.idType,
          kycIdNumberEncrypted: encryptedIdNumber,
          kycIdNumberLast4: dto.idNumber.slice(-4),
          kycApplicantFingerprint: applicantFingerprint,
          kycConsentAt: consentAt,
          kycConsentVersion: this.sellerKycProvider.consentVersion,
          kycProviderMode: this.sellerKycProvider.mode,
          kycLastCheckAt: checkedAt,
          kycFailureCode: null,
          kycNameMatch: null,
          kycVerifiedAt: null,
        },
      });
      if (claim.count !== 1) return false;
      await tx.sellerKycCheck.updateMany({
        where: { sellerProfileId: profile.id, status: SellerKycStatus.PENDING },
        data: { status: 'provider_unavailable', providerCode: 'PREVIOUS_CHECK_TIMED_OUT' },
      });
      await tx.sellerKycCheck.create({
        data: {
          id: checkId,
          sellerProfileId: profile.id,
          provider: 'stackapi',
          mode: this.sellerKycProvider.mode,
          checkType: dto.idType,
          status: SellerKycStatus.PENDING,
          checkedAt,
        },
      });
      return true;
    });
    if (!claimed) throw new ConflictException('Identity verification is already in progress');

    const result = await this.sellerKycProvider.verifyIdentity({
      idType: dto.idType as SellerKycIdType,
      idNumber: dto.idNumber,
      firstName: user.firstName,
      lastName: user.lastName,
      dateOfBirth: user.dateOfBirth,
    });
    const statusMap = {
      verified: SellerKycStatus.VERIFIED,
      sandbox: SellerKycStatus.SANDBOX,
      review_required: SellerKycStatus.REVIEW_REQUIRED,
      not_verified: SellerKycStatus.REVIEW_REQUIRED,
      unavailable: SellerKycStatus.PROVIDER_UNAVAILABLE,
    } as const;
    const status = statusMap[result.status];
    const completed = await this.sellersRepository.prisma.$transaction(async (tx) => {
      const update = await tx.sellerProfile.updateMany({
        where: {
          id: profile.id,
          kycApplicantFingerprint: applicantFingerprint,
          kycLastCheckAt: checkedAt,
        },
        data: {
          kycStatus: status,
          kycIdType: dto.idType,
          kycIdNumberEncrypted: encryptedIdNumber,
          kycIdNumberLast4: dto.idNumber.slice(-4),
          kycConsentAt: consentAt,
          kycConsentVersion: this.sellerKycProvider.consentVersion,
          kycProviderMode: result.mode,
          kycVerifiedAt: status === SellerKycStatus.VERIFIED ? checkedAt : null,
          kycLastCheckAt: checkedAt,
          kycFailureCode: result.status === 'verified' ? null : result.providerCode,
          kycNameMatch: result.nameMatch,
        },
      });
      await tx.sellerKycCheck.update({
        where: { id: checkId },
        data: {
          status: update.count === 1 ? result.status : 'review_required',
          providerCode:
            update.count === 1 ? result.providerCode : 'APPLICANT_DETAILS_CHANGED_DURING_CHECK',
          nameMatch: update.count === 1 ? result.nameMatch : null,
        },
      });
      return update.count === 1;
    });
    if (!completed) {
      throw new ConflictException(
        'Applicant details changed during verification. Submit identity verification again.',
      );
    }
    return {
      status,
      idType: dto.idType,
      idNumberLast4: dto.idNumber.slice(-4),
      checkedAt,
      message:
        status === SellerKycStatus.VERIFIED
          ? 'Identity verified. Continue to payout account verification.'
          : status === SellerKycStatus.SANDBOX
            ? 'Test verification completed. Live verification is required before automatic approval.'
            : status === SellerKycStatus.PROVIDER_UNAVAILABLE
              ? 'Identity verification is temporarily unavailable. Your details were saved securely; retry later.'
              : 'Identity verification needs a manual review. Continue with the remaining application steps.',
    };
  }

  async setApplicationBank(userId: string, dto: BankingDetailsDto): Promise<object> {
    const [user, profile] = await Promise.all([
      this.usersService.findById(userId),
      this.sellersRepository.prisma.sellerProfile.findFirst({ where: { userId, deletedAt: null } }),
    ]);
    if (!user.isVerified || !user.email) {
      throw new ForbiddenException('Verify your email before adding payout details');
    }
    if (!profile) throw new NotFoundException('Seller application not found');
    if (
      profile.applicationStatus === SellerApplicationStatus.PENDING ||
      profile.applicationStatus === SellerApplicationStatus.MORE_INFORMATION_NEEDED
    ) {
      throw new ConflictException('Update payout details after the application review is complete');
    }
    if (
      [SellerKycStatus.NOT_STARTED, SellerKycStatus.PENDING].includes(
        profile.kycStatus as SellerKycStatus,
      )
    ) {
      throw new BadRequestException('Complete identity verification before adding payout details');
    }

    const resolved = await this.sellerBankingService.resolveAccount(
      dto.bankCode,
      dto.bankAccountNumber,
    );
    const expectedName =
      profile.applicantType === SellerApplicantType.INDIVIDUAL
        ? `${user.firstName} ${user.lastName}`
        : profile.businessName;
    const normalizeName = (value: string) =>
      value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
    if (normalizeName(resolved.accountName) !== normalizeName(expectedName)) {
      throw new BadRequestException(
        'The verified bank account name must match the seller applicant name',
      );
    }

    const verifiedAt = new Date();
    const updated = await this.sellersRepository.prisma.sellerProfile.update({
      where: { id: profile.id },
      data: {
        bankName: resolved.bankName,
        bankCode: resolved.bankCode,
        bankAccountNumber: this.sellerPiiService.encryptBankAccountNumber(dto.bankAccountNumber),
        bankAccountNumberLast4: dto.bankAccountNumber.slice(-4),
        bankAccountName: resolved.accountName,
        bankDetailsCompletedAt: verifiedAt,
        bankVerificationProvider: this.sellerBankingService.providerName,
        bankVerifiedAt: verifiedAt,
      },
    });
    return {
      bankName: updated.bankName,
      bankAccountName: updated.bankAccountName,
      bankAccountNumberMasked: this.maskAccountNumber(
        updated.bankAccountNumber,
        updated.bankAccountNumberLast4,
      ),
      verifiedAt: updated.bankVerifiedAt,
      verificationProvider: updated.bankVerificationProvider,
    };
  }

  async submitMyApplication(userId: string): Promise<object> {
    const [user, profile] = await Promise.all([
      this.usersService.findById(userId),
      this.sellersRepository.prisma.sellerProfile.findFirst({
        where: { userId, deletedAt: null },
        include: { documents: { where: { deletedAt: null }, select: { documentType: true } } },
      }),
    ]);
    if (!user.isVerified || !user.email) {
      throw new ForbiddenException('Verify your email before submitting a seller application');
    }
    if (!profile) throw new NotFoundException('Seller application not found');
    if (
      ![
        SellerApplicationStatus.DRAFT,
        SellerApplicationStatus.MORE_INFORMATION_NEEDED,
        SellerApplicationStatus.REJECTED,
      ].includes(profile.applicationStatus as SellerApplicationStatus)
    ) {
      throw new ConflictException(
        'This seller application cannot be submitted in its current status',
      );
    }
    if (
      ![
        SellerKycStatus.VERIFIED,
        SellerKycStatus.SANDBOX,
        SellerKycStatus.REVIEW_REQUIRED,
        SellerKycStatus.PROVIDER_UNAVAILABLE,
      ].includes(profile.kycStatus as SellerKycStatus)
    ) {
      throw new BadRequestException(
        'Submit identity verification before submitting your application',
      );
    }
    const currentIdentityFingerprint = this.sellerPiiService.fingerprintSellerIdentity(
      user.firstName,
      user.lastName,
      user.dateOfBirth,
    );
    if (profile.kycApplicantFingerprint !== currentIdentityFingerprint) {
      throw new BadRequestException(
        'Your identity details changed. Submit KYC again before continuing',
      );
    }
    if (!profile.bankVerifiedAt || !profile.bankVerificationProvider) {
      throw new BadRequestException('Verify a matching payout account before submitting');
    }
    const requiredDocuments =
      profile.applicantType === SellerApplicantType.INDIVIDUAL
        ? [[SellerDocumentType.GOVERNMENT_ID, SellerDocumentType.GOVERNMENT_ID_FRONT]]
        : [
            [SellerDocumentType.CAC_REGISTRATION],
            [SellerDocumentType.OWNER_ID],
            [SellerDocumentType.GOVERNMENT_ID_FRONT, SellerDocumentType.GOVERNMENT_ID],
          ];
    if (
      requiredDocuments.some(
        (alternatives) =>
          !alternatives.some((type) => profile.documents.some((doc) => doc.documentType === type)),
      )
    ) {
      throw new BadRequestException('Upload the required identity documents before submitting');
    }

    let finalKycStatus = profile.kycStatus as SellerKycStatus;
    let businessCheckVerified = profile.applicantType === SellerApplicantType.INDIVIDUAL;
    if (
      profile.applicantType === SellerApplicantType.REGISTERED_BUSINESS &&
      profile.kycStatus === SellerKycStatus.VERIFIED &&
      profile.kycProviderMode === 'live' &&
      this.sellerKycProvider.mode === 'live'
    ) {
      const companyType = this.cacCompanyType(profile.businessType as BusinessType);
      if (!companyType) {
        finalKycStatus = SellerKycStatus.REVIEW_REQUIRED;
        const checkedAt = new Date();
        await this.sellersRepository.prisma.$transaction(async (tx) => {
          await tx.sellerKycCheck.create({
            data: {
              id: createPublicId(),
              sellerProfileId: profile.id,
              provider: 'cadna_manual',
              mode: 'live',
              checkType: 'cac',
              status: 'review_required',
              providerCode: 'CAC_COMPANY_TYPE_REQUIRES_REVIEW',
              checkedAt,
            },
          });
          await tx.sellerProfile.update({
            where: { id: profile.id },
            data: {
              kycStatus: finalKycStatus,
              kycLastCheckAt: checkedAt,
              kycFailureCode: 'CAC_COMPANY_TYPE_REQUIRES_REVIEW',
            },
          });
        });
      } else {
        const checkedAt = new Date();
        const result = await this.sellerKycProvider.verifyBusiness({
          registrationNumber: profile.businessRegistrationNumber ?? '',
          companyType,
        });
        businessCheckVerified = result.status === 'verified' && result.nameMatch === true;
        if (!businessCheckVerified) {
          finalKycStatus =
            result.status === 'unavailable'
              ? SellerKycStatus.PROVIDER_UNAVAILABLE
              : SellerKycStatus.REVIEW_REQUIRED;
        }
        await this.sellersRepository.prisma.$transaction(async (tx) => {
          await tx.sellerKycCheck.create({
            data: {
              id: createPublicId(),
              sellerProfileId: profile.id,
              provider: 'stackapi',
              mode: result.mode,
              checkType: 'cac',
              status: result.status,
              providerCode: result.providerCode,
              nameMatch: result.nameMatch,
              checkedAt,
            },
          });
          await tx.sellerProfile.update({
            where: { id: profile.id },
            data: {
              kycStatus: finalKycStatus,
              kycLastCheckAt: checkedAt,
              kycFailureCode: result.status === 'verified' ? null : result.providerCode,
            },
          });
        });
      }
    } else if (profile.applicantType === SellerApplicantType.REGISTERED_BUSINESS) {
      businessCheckVerified = false;
    }

    const fromStatus = profile.applicationStatus;
    const submittedAt = new Date();
    const canAutoApprove =
      finalKycStatus === SellerKycStatus.VERIFIED &&
      profile.kycProviderMode === 'live' &&
      this.sellerKycProvider.mode === 'live' &&
      businessCheckVerified;
    await this.sellersRepository.prisma.$transaction(async (tx) => {
      await tx.sellerProfile.update({
        where: { id: profile.id },
        data: {
          applicationStatus: canAutoApprove
            ? SellerApplicationStatus.APPROVED
            : SellerApplicationStatus.PENDING,
          submittedAt,
          reviewReason: null,
          requestedDocumentTypes: [],
          reviewedAt: canAutoApprove ? submittedAt : null,
          reviewedById: canAutoApprove ? userId : null,
          isApproved: canAutoApprove,
          approvalMethod: canAutoApprove ? 'automated' : 'manual',
          approvedAt: canAutoApprove ? submittedAt : null,
          approvedById: null,
        },
      });
      await tx.sellerApplicationReview.create({
        data: {
          id: createPublicId(),
          sellerProfileId: profile.id,
          actorId: userId,
          fromStatus,
          toStatus: canAutoApprove
            ? SellerApplicationStatus.APPROVED
            : SellerApplicationStatus.PENDING,
        },
      });
      if (canAutoApprove) {
        const accountTypes = user.accountTypes?.length
          ? [...user.accountTypes]
          : [user.accountType];
        if (!accountTypes.includes(AccountType.SELLER)) accountTypes.push(AccountType.SELLER);
        await tx.user.update({ where: { id: userId }, data: { accountTypes } });
        await tx.seller.updateMany({
          where: { ownerId: userId, deletedAt: null },
          data: { isActive: true },
        });
      }
    });
    return {
      applicationStatus: canAutoApprove
        ? SellerApplicationStatus.APPROVED
        : SellerApplicationStatus.PENDING,
      kycStatus: finalKycStatus,
      approvalMethod: canAutoApprove ? 'automated' : 'manual_review',
      submittedAt,
    };
  }

  private cacCompanyType(type: BusinessType): 'RC' | 'BN' | null {
    if (type === BusinessType.LLC) return 'RC';
    if (type === BusinessType.SOLE_PROPRIETOR) return 'BN';
    return null;
  }

  async getMyApplicationProducts(userId: string, query: ProductQueryDto): Promise<object> {
    const profile = await this.sellersRepository.prisma.sellerProfile.findFirst({
      where: { userId, deletedAt: null },
    });
    if (!profile) throw new NotFoundException('Seller application not found');
    this.assertDraftManagementStatus(profile.applicationStatus);
    const seller = await this.sellersRepository.prisma.seller.findFirst({
      where: { ownerId: userId, deletedAt: null },
    });
    if (!seller)
      return {
        items: [],
        pagination: {
          page: query.page,
          limit: query.limit,
          totalItems: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false,
        },
      };
    return this.productsService.findMyProducts(userId, query);
  }

  async createApplicationProductDraft(
    user: { userId: string; accountType: string },
    dto: CreateMyProductDto,
  ): Promise<object> {
    const profile = await this.sellersRepository.prisma.sellerProfile.findFirst({
      where: { userId: user.userId, deletedAt: null },
    });
    if (!profile) throw new NotFoundException('Seller application not found');
    this.assertDraftManagementStatus(profile.applicationStatus);
    await this.ensurePrivateApplicationStore(user.userId, profile.businessName);
    return this.productsService.createMyProduct({ ...dto, isActive: false }, user);
  }

  async updateApplicationProductDraft(
    user: { userId: string; accountType: string },
    productId: string,
    dto: UpdateProductDto,
  ): Promise<object> {
    const profile = await this.sellersRepository.prisma.sellerProfile.findFirst({
      where: { userId: user.userId, deletedAt: null },
    });
    if (!profile) throw new NotFoundException('Seller application not found');
    this.assertDraftManagementStatus(profile.applicationStatus);
    return this.productsService.updateProduct(productId, { ...dto, isActive: false }, user);
  }

  async setMyStorefrontActive(userId: string, isActive: boolean): Promise<object> {
    const profile = await this.sellersRepository.prisma.sellerProfile.findFirst({
      where: { userId, deletedAt: null },
    });
    if (!profile || profile.applicationStatus !== SellerApplicationStatus.APPROVED) {
      throw new ForbiddenException('Only approved sellers can change storefront availability');
    }
    const seller = await this.sellersRepository.prisma.seller.findFirst({
      where: { ownerId: userId, deletedAt: null },
    });
    if (!seller) throw new NotFoundException('Seller storefront not found');
    const updated = await this.sellersRepository.prisma.seller.update({
      where: { id: seller.id },
      data: { isActive },
      select: { id: true, name: true, slug: true, isActive: true },
    });
    return updated;
  }

  private assertDraftManagementStatus(status: string): void {
    if (
      ![
        SellerApplicationStatus.DRAFT,
        SellerApplicationStatus.PENDING,
        SellerApplicationStatus.MORE_INFORMATION_NEEDED,
        SellerApplicationStatus.REJECTED,
      ].includes(status as SellerApplicationStatus)
    ) {
      throw new ConflictException(
        'Application product drafts are only available before seller approval',
      );
    }
  }

  private async ensurePrivateApplicationStore(userId: string, businessName: string) {
    const existing = await this.sellersRepository.prisma.seller.findFirst({
      where: { ownerId: userId, deletedAt: null },
    });
    if (existing) {
      if (!existing.isActive && existing.name !== businessName) {
        return this.sellersRepository.prisma.seller.update({
          where: { id: existing.id },
          data: { name: businessName },
        });
      }
      return existing;
    }
    const base =
      businessName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'seller';
    return this.sellersRepository.create({
      name: businessName,
      slug: `${base}-${Date.now().toString(36)}`,
      owner: userId as any,
      isActive: false,
      isVerified: false,
    } as any);
  }

  async uploadApplicationDocument(
    userId: string,
    documentType: SellerDocumentType,
    file: Express.Multer.File,
  ): Promise<object> {
    if (!Object.values(SellerDocumentType).includes(documentType)) {
      throw new BadRequestException('Unsupported seller document type');
    }
    const [user, profile] = await Promise.all([
      this.usersService.findById(userId),
      this.sellersRepository.prisma.sellerProfile.findFirst({
        where: { userId, deletedAt: null },
        include: { documents: { where: { deletedAt: null } } },
      }),
    ]);
    if (!user.isVerified || !user.email) {
      throw new ForbiddenException('Verify your email before uploading seller documents');
    }
    if (!profile) throw new NotFoundException('Seller application not found');
    if (
      ![
        SellerApplicationStatus.DRAFT,
        SellerApplicationStatus.MORE_INFORMATION_NEEDED,
        SellerApplicationStatus.REJECTED,
      ].includes(profile.applicationStatus as SellerApplicationStatus)
    ) {
      throw new ConflictException(
        'Documents cannot be changed while the application is under review or approved',
      );
    }
    const requiredTypes =
      profile.applicantType === SellerApplicantType.INDIVIDUAL
        ? [
            SellerDocumentType.GOVERNMENT_ID,
            SellerDocumentType.GOVERNMENT_ID_FRONT,
            SellerDocumentType.GOVERNMENT_ID_BACK,
          ]
        : [
            SellerDocumentType.CAC_REGISTRATION,
            SellerDocumentType.OWNER_ID,
            SellerDocumentType.GOVERNMENT_ID_FRONT,
            SellerDocumentType.GOVERNMENT_ID_BACK,
          ];
    if (
      !requiredTypes.includes(documentType) &&
      !profile.requestedDocumentTypes.includes(documentType)
    ) {
      throw new BadRequestException('This document type was not requested for this application');
    }
    if (profile.documents.some((document) => document.documentType === documentType)) {
      throw new ConflictException(
        'A document of this type is already attached; delete it before replacing it',
      );
    }

    const uploaded = await this.uploadService.uploadPrivateSellerDocument(file, userId);
    try {
      const row = await this.sellersRepository.prisma.sellerApplicationDocument.create({
        data: {
          id: createPublicId(),
          sellerProfileId: profile.id,
          uploadedById: userId,
          documentType,
          storageKey: uploaded.storageKey,
          resourceType: uploaded.resourceType,
          format: uploaded.format,
          originalFileName: this.safeDocumentFileName(file.originalname),
          contentType: file.mimetype,
          sizeBytes: uploaded.sizeBytes,
        },
        select: {
          id: true,
          documentType: true,
          originalFileName: true,
          contentType: true,
          sizeBytes: true,
          createdAt: true,
        },
      });
      return row;
    } catch (error) {
      await this.uploadService
        .deletePrivateSellerDocument(uploaded.storageKey, uploaded.resourceType)
        .catch(() => undefined);
      throw error;
    }
  }

  async deleteApplicationDocument(userId: string, documentId: string): Promise<object> {
    const document = await this.sellersRepository.prisma.sellerApplicationDocument.findFirst({
      where: { id: documentId, deletedAt: null, sellerProfile: { userId, deletedAt: null } },
      include: { sellerProfile: { select: { applicationStatus: true } } },
    });
    if (!document) throw new NotFoundException('Seller application document not found');
    if (
      ![
        SellerApplicationStatus.DRAFT,
        SellerApplicationStatus.MORE_INFORMATION_NEEDED,
        SellerApplicationStatus.REJECTED,
      ].includes(document.sellerProfile.applicationStatus as SellerApplicationStatus)
    ) {
      throw new ConflictException(
        'Documents cannot be deleted while the application is under review or approved',
      );
    }
    await this.uploadService.deletePrivateSellerDocument(
      document.storageKey,
      document.resourceType,
    );
    await this.sellersRepository.prisma.sellerApplicationDocument.update({
      where: { id: document.id },
      data: { deletedAt: new Date() },
    });
    return { deleted: true };
  }

  async getAdminDocumentDownloadUrl(documentId: string): Promise<object> {
    const document = await this.sellersRepository.prisma.sellerApplicationDocument.findFirst({
      where: { id: documentId, deletedAt: null, sellerProfile: { deletedAt: null } },
      select: { storageKey: true, resourceType: true, format: true },
    });
    if (!document) throw new NotFoundException('Seller application document not found');
    return {
      url: this.uploadService.createPrivateSellerDocumentDownloadUrl(
        document.storageKey,
        document.resourceType,
        document.format,
        60,
      ),
      expiresInSeconds: 60,
    };
  }

  private safeDocumentFileName(value: string): string {
    const name =
      value
        .split(/[\\/]/)
        .pop()
        ?.replace(/[\r\n\0]/g, '')
        .trim() ?? '';
    return name.slice(0, 120) || 'seller-document';
  }

  private maskAccountNumber(accountNumber: string | null, last4?: string | null): string | null {
    if (!accountNumber) return null;
    const suffix = last4 ?? (accountNumber.startsWith('v1:') ? null : accountNumber.slice(-4));
    return suffix ? `${'*'.repeat(Math.max(10 - suffix.length, 0))}${suffix}` : null;
  }

  async saveMyApplication(userId: string, dto: SaveSellerApplicationDto): Promise<object> {
    const user = await this.usersService.findById(userId);
    if (!user.isVerified || !user.email) {
      throw new ForbiddenException('Verify your email before starting a seller application');
    }
    if (!hasAccountType(user, AccountType.BUYER) && !hasAccountType(user, AccountType.SELLER)) {
      throw new ForbiddenException('A buyer account is required to apply as a seller');
    }

    const current = await this.sellersRepository.prisma.sellerProfile.findFirst({
      where: { userId, deletedAt: null },
    });
    if (current?.applicationStatus === SellerApplicationStatus.APPROVED) {
      throw new ConflictException('This account already has an approved seller application');
    }
    if (current?.applicationStatus === SellerApplicationStatus.PENDING) {
      throw new ConflictException('A submitted application cannot be edited while under review');
    }
    if (dto.applicantType === 'individual' && dto.businessRegistrationNumber !== undefined) {
      throw new BadRequestException('Individuals must not submit a business registration number');
    }

    const data = {
      applicantType: dto.applicantType,
      businessName: dto.businessName.trim(),
      businessRegistrationNumber:
        dto.applicantType === 'registered_business'
          ? (dto.businessRegistrationNumber?.trim() ?? null)
          : null,
      businessAddress: dto.businessAddress.trim(),
      businessType: dto.businessType,
      applicationStatus:
        current?.applicationStatus === SellerApplicationStatus.MORE_INFORMATION_NEEDED
          ? SellerApplicationStatus.MORE_INFORMATION_NEEDED
          : SellerApplicationStatus.DRAFT,
      ...(current &&
      (current.applicantType !== dto.applicantType ||
        current.businessName !== dto.businessName.trim() ||
        current.businessRegistrationNumber !== (dto.businessRegistrationNumber?.trim() ?? null))
        ? {
            kycStatus: SellerKycStatus.NOT_STARTED,
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
          }
        : {}),
    };

    const profile = current
      ? await this.sellersRepository.prisma.sellerProfile.update({
          where: { id: current.id },
          data,
        })
      : await this.sellersRepository.prisma.sellerProfile.create({
          data: {
            id: createPublicId(),
            userId,
            ...data,
            isApproved: false,
          },
        });
    return {
      id: profile.id,
      applicantType: profile.applicantType,
      businessName: profile.businessName,
      businessRegistrationNumber: profile.businessRegistrationNumber,
      businessAddress: profile.businessAddress,
      businessType: profile.businessType,
      applicationStatus: profile.applicationStatus,
    };
  }

  async createSeller(dto: CreateSellerDto, ownerId: string): Promise<object> {
    const existing = await this.sellersRepository.findByOwner(ownerId);
    if (existing) {
      throw new ConflictException('You already have a seller profile. A seller can only have one.');
    }

    const slug =
      dto.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') +
      '-' +
      Date.now().toString(36);

    const seller = await this.sellersRepository.create({
      name: dto.name,
      slug,
      logoUrl: dto.logoUrl ?? null,
      location: dto.location ?? null,
      deliveryTimeRange: dto.deliveryTimeRange ?? null,
      owner: ownerId as any,
      isVerified: false,
      responseRatePercent: 0,
      averageRating: 0,
      reviewCount: 0,
      followerCount: 0,
      isActive: true,
      deletedAt: null,
    } as any);

    return this.toDto(seller);
  }

  async getMySeller(ownerId: string): Promise<object> {
    const seller = await this.sellersRepository.findByOwner(ownerId);
    if (!seller) throw new NotFoundException('You do not have a seller profile yet');
    return this.toDto(seller);
  }

  async getMyOnboardingStatus(userId: string): Promise<object> {
    const [user, profile, storefront] = await Promise.all([
      this.usersService.findById(userId),
      this.sellersRepository.prisma.sellerProfile.findFirst({ where: { userId, deletedAt: null } }),
      this.sellersRepository.findByOwner(userId),
    ]);

    if (!profile) {
      throw new NotFoundException('Seller profile not found');
    }

    const bankingSubmitted = !!(
      profile.bankName &&
      profile.bankAccountName &&
      profile.bankAccountNumber &&
      profile.bankDetailsCompletedAt
    );

    const maskedAccountNumber = this.maskAccountNumber(
      profile.bankAccountNumber,
      profile.bankAccountNumberLast4,
    );

    const nextStep = !user.isVerified
      ? 'verify_email'
      : !bankingSubmitted
        ? 'submit_banking'
        : !profile.isApproved
          ? 'await_approval'
          : !storefront
            ? 'create_storefront'
            : 'ready';

    return {
      account: {
        email: user.email,
        accountType: user.accountType,
        isEmailVerified: user.isVerified,
      },
      profile: {
        businessName: profile.businessName,
        businessRegistrationNumber: profile.businessRegistrationNumber,
        businessAddress: profile.businessAddress,
        businessType: profile.businessType,
      },
      banking: {
        isSubmitted: bankingSubmitted,
        completedAt: profile.bankDetailsCompletedAt,
        bankName: profile.bankName,
        bankAccountName: profile.bankAccountName,
        bankAccountNumberMasked: maskedAccountNumber,
      },
      approval: {
        isApproved: profile.isApproved,
        approvedAt: profile.approvedAt,
      },
      storefront: storefront
        ? {
            exists: true,
            id: (storefront as unknown as { _id: { toString(): string } })._id.toString(),
            name: storefront.name,
            slug: storefront.slug,
          }
        : {
            exists: false,
            id: null,
            name: null,
            slug: null,
          },
      nextStep,
    };
  }

  async updateMySeller(
    dto: UpdateSellerDto,
    currentUser: { userId: string; accountType: string },
    sellerId?: string,
  ): Promise<object> {
    let seller;
    if (sellerId && currentUser.accountType === AccountType.ADMIN) {
      seller = await this.sellersRepository.findById(sellerId);
    } else {
      seller = await this.sellersRepository.findByOwner(currentUser.userId);
    }

    if (!seller) throw new NotFoundException('Seller not found');

    if (currentUser.accountType !== AccountType.ADMIN) {
      const ownerId = (seller as any).owner?.toString();
      if (ownerId !== currentUser.userId)
        throw new ForbiddenException('You do not own this seller profile');
    }

    const id = (seller as any)._id.toString();
    const updates: Record<string, unknown> = {};
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.logoUrl !== undefined) updates.logoUrl = dto.logoUrl;
    if (dto.location !== undefined) updates.location = dto.location;
    if (dto.deliveryTimeRange !== undefined) updates.deliveryTimeRange = dto.deliveryTimeRange;

    const updated = await this.sellersRepository.update(id, updates as any);
    return this.toDto(updated!);
  }

  async getMyPickupAddress(userId: string): Promise<object> {
    const seller = await this.sellersRepository.prisma.seller.findFirst({
      where: { ownerId: userId, deletedAt: null },
      select: { pickupAddress: true, pickupAddressConfirmedAt: true },
    });
    if (!seller) throw new NotFoundException('Seller storefront not found');
    return {
      pickupAddress: seller.pickupAddress,
      confirmedAt: seller.pickupAddressConfirmedAt,
      confirmed: !!seller.pickupAddressConfirmedAt,
    };
  }

  async confirmMyPickupAddress(userId: string, dto: ConfirmPickupAddressDto): Promise<object> {
    const seller = await this.sellersRepository.prisma.seller.findFirst({
      where: { ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!seller) throw new NotFoundException('Seller storefront not found');
    const address = {
      recipientName: dto.recipientName,
      phoneNumber: dto.phoneNumber,
      street1: dto.street1,
      street2: dto.street2,
      city: dto.city,
      state: dto.state,
      country: dto.country ?? 'Nigeria',
      postalCode: dto.postalCode,
      notes: dto.notes,
    };
    const confirmedAt = new Date();
    const updated = await this.sellersRepository.prisma.seller.update({
      where: { id: seller.id },
      data: {
        pickupAddress: address,
        pickupAddressConfirmedAt: confirmedAt,
      },
      select: { pickupAddress: true, pickupAddressConfirmedAt: true },
    });
    return {
      pickupAddress: updated.pickupAddress,
      confirmedAt: updated.pickupAddressConfirmedAt,
      confirmed: true,
    };
  }

  private toDto(seller: any): object {
    return {
      id: seller._id?.toString() ?? seller.id,
      name: seller.name,
      slug: seller.slug,
      logoUrl: seller.logoUrl,
      location: seller.location,
      deliveryTimeRange: seller.deliveryTimeRange,
      isVerified: seller.isVerified,
      responseRatePercent: seller.responseRatePercent,
      averageRating: seller.averageRating,
      reviewCount: seller.reviewCount,
      followerCount: seller.followerCount,
      joinedYear: seller.joinedYear,
      sellerUrl: `/sellers/${seller.slug}`,
    };
  }

  async getSummary(sellerId: string) {
    const seller = await this.sellersRepository.findById(sellerId);
    if (!seller || !seller.isActive) {
      throw new NotFoundException('Seller not found');
    }

    const approvedProfile = await this.sellersRepository.prisma.sellerProfile.findFirst({
      where: {
        userId: (seller as any).owner,
        deletedAt: null,
        applicationStatus: SellerApplicationStatus.APPROVED,
        isApproved: true,
        kycStatus: SellerKycStatus.VERIFIED,
      },
      select: { id: true },
    });
    if (!approvedProfile) throw new NotFoundException('Seller not found');

    const id = (seller as unknown as { _id: { toString(): string } })._id.toString();

    const productStats = await this.sellersRepository.prisma.product.aggregate({
      where: {
        sellerId: id,
        deletedAt: null,
        isActive: true,
        publicationStatus: 'live',
        isDeactivated: false,
        moderationStatus: 'approved',
      },
      _count: { _all: true },
      _sum: { salesCount: true },
    });

    return {
      id,
      name: seller.name,
      slug: seller.slug,
      isVerified: seller.isVerified,
      responseRatePercent: seller.responseRatePercent,
      averageRating: seller.averageRating,
      joinedYear: seller.joinedYear,
      reviewCount: seller.reviewCount,
      followerCount: seller.followerCount,
      logoUrl: seller.logoUrl,
      location: seller.location,
      deliveryTimeRange: seller.deliveryTimeRange,
      productCount: productStats._count._all,
      totalSales: productStats._sum.salesCount ?? 0,
      sellerUrl: `/sellers/${seller.slug}`,
    };
  }

  async getMyBankingDetails(userId: string): Promise<object> {
    const profile = await this.sellersRepository.prisma.sellerProfile.findFirst({
      where: { userId, deletedAt: null },
    });
    if (!profile) {
      throw new NotFoundException('Seller profile not found');
    }
    return {
      bankName: profile.bankName,
      bankAccountNumberMasked: this.maskAccountNumber(
        profile.bankAccountNumber,
        profile.bankAccountNumberLast4,
      ),
      bankAccountName: profile.bankAccountName,
      completedAt: profile.bankDetailsCompletedAt,
      verifiedAt: profile.bankVerifiedAt,
      verificationProvider: profile.bankVerificationProvider,
    };
  }

  async setMyBankingDetails(userId: string, dto: BankingDetailsDto): Promise<object> {
    return this.setApplicationBank(userId, dto);
  }

  async followSeller(userId: string, sellerId: string): Promise<void> {
    const seller = await this.sellersRepository.findById(sellerId);
    if (!seller) throw new NotFoundException('Seller not found');

    try {
      await this.sellersRepository.follow(userId, sellerId);
    } catch (err: any) {
      if (isPrismaUniqueConstraintError(err)) {
        throw new ConflictException('You are already following this seller');
      }
      throw err;
    }
  }

  async unfollowSeller(userId: string, sellerId: string): Promise<void> {
    const seller = await this.sellersRepository.findById(sellerId);
    if (!seller) throw new NotFoundException('Seller not found');

    const removed = await this.sellersRepository.unfollow(userId, sellerId);
    if (!removed) throw new NotFoundException('You are not following this seller');
  }

  async getFollowedSellers(userId: string, page = 1, limit = 20): Promise<object> {
    const { items, totalItems } = await this.sellersRepository.findFollowedByUser(
      userId,
      page,
      limit,
    );
    const sellers = await Promise.all(
      items.map(async (entry: { seller: unknown }) => {
        const seller = entry.seller as unknown as Seller;
        if (!seller || seller.deletedAt || !seller.isActive) return null;
        const id = (seller as unknown as { _id: { toString(): string } })._id.toString();
        const approvedProfile = await this.sellersRepository.prisma.sellerProfile.findFirst({
          where: {
            userId: (seller as any).owner,
            deletedAt: null,
            applicationStatus: SellerApplicationStatus.APPROVED,
            isApproved: true,
            kycStatus: SellerKycStatus.VERIFIED,
          },
          select: { id: true },
        });
        if (!approvedProfile) return null;
        const products = await this.sellersRepository.prisma.product.findMany({
          where: {
            sellerId: id,
            deletedAt: null,
            isActive: true,
            publicationStatus: 'live',
            isDeactivated: false,
            moderationStatus: 'approved',
          },
          orderBy: { createdAt: 'desc' },
          take: 4,
          include: { seller: true },
        });
        return {
          ...(await this.getSummary(id)),
          products: products.map((product) =>
            this.productsService.toCard({
              ...product,
              _id: product.id,
              seller: product.seller ? { ...product.seller, _id: product.seller.id } : null,
            } as unknown as Product),
          ),
        };
      }),
    );
    const visible = sellers.filter((seller) => seller !== null);
    return {
      items: visible,
      pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };
  }
}
