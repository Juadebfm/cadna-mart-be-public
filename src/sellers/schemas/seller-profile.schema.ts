import { BaseSchema } from '@shared/base/base.schema';
export enum BusinessType {
  INDIVIDUAL = 'individual',
  SOLE_PROPRIETOR = 'sole_proprietor',
  LLC = 'llc',
  PARTNERSHIP = 'partnership',
}

export enum SellerApplicantType {
  INDIVIDUAL = 'individual',
  REGISTERED_BUSINESS = 'registered_business',
}

export enum SellerApplicationStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  MORE_INFORMATION_NEEDED = 'more_information_needed',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum SellerDocumentType {
  GOVERNMENT_ID = 'government_id',
  GOVERNMENT_ID_FRONT = 'government_id_front',
  GOVERNMENT_ID_BACK = 'government_id_back',
  CAC_REGISTRATION = 'cac_registration',
  OWNER_ID = 'owner_id',
  OTHER = 'other',
}

export enum SellerKycStatus {
  NOT_STARTED = 'not_started',
  PENDING = 'pending',
  VERIFIED = 'verified',
  SANDBOX = 'sandbox',
  REVIEW_REQUIRED = 'review_required',
  PROVIDER_UNAVAILABLE = 'provider_unavailable',
}

export class SellerProfile extends BaseSchema {
  user!: string;
  applicantType!: SellerApplicantType | null;
  businessName!: string;
  businessRegistrationNumber!: string | null;
  businessAddress!: string;
  businessType!: BusinessType;
  bankName!: string | null;
  bankCode!: string | null;
  bankAccountNumber!: string | null;
  bankAccountName!: string | null;
  bankDetailsCompletedAt!: Date | null;
  bankVerificationProvider!: string | null;
  bankVerifiedAt!: Date | null;
  applicationStatus!: SellerApplicationStatus;
  submittedAt!: Date | null;
  reviewReason!: string | null;
  requestedDocumentTypes!: SellerDocumentType[];
  reviewedAt!: Date | null;
  reviewedBy!: string | null;
  isApproved!: boolean;
  approvalMethod!: 'manual' | 'automated';
  approvedAt!: Date | null;
  approvedBy!: string | null;
  kycStatus!: SellerKycStatus;
  kycIdType!: string | null;
  kycIdNumberLast4!: string | null;
  kycConsentAt!: Date | null;
  kycVerifiedAt!: Date | null;
}
