import { BaseSchema } from '@shared/base/base.schema';
export enum PartnerStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
}
export enum CommitmentStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  ACTIVE = 'active',
  SETTLED = 'settled',
  REJECTED = 'rejected',
  DISPUTED = 'disputed',
}
export class PartnerProfile extends BaseSchema {
  userId!: string;
  status!: PartnerStatus;
  kycSubmitted!: boolean;
  agreementAccepted!: boolean;
  agreementAcceptedAt!: Date | null;
  fundingCapNGN!: number;
  approvedBy!: string | null;
  approvedAt!: Date | null;
}
export class PartnerCommitment extends BaseSchema {
  partnerId!: string;
  productId!: string;
  amountNGN!: number;
  status!: CommitmentStatus;
  approvedBy!: string | null;
  approvedAt!: Date | null;
}
export class PartnerDispute extends BaseSchema {
  partnerId!: string;
  commitmentId!: string;
  reason!: string;
  status!: string;
  resolvedBy!: string | null;
  resolution!: string | null;
}
