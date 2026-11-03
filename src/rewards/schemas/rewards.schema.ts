import { BaseSchema } from '@shared/base/base.schema';
// Singleton program config (keyed by a fixed slug)
export class RewardsProgram extends BaseSchema {
  slug!: string;
  name!: string;
  tagline!: string | null;
  logoUrl!: string | null;
}
// Tier definitions (e.g. Bronze, Silver, Gold)
export class RewardsTier extends BaseSchema {
  name!: string;
  minPoints!: number;
  maxPoints!: number | null;
  cashbackRate!: number;
}
// Festive / seasonal campaigns
export class RewardsCampaign extends BaseSchema {
  name!: string;
  startsAt!: Date;
  endsAt!: Date;
  pointsMultiplier!: number;
  isActive!: boolean;
}
// Per-user rewards account (points balance, tier, cashback)
export class RewardsAccount extends BaseSchema {
  userId!: string;
  points!: number;
  cashbackKobo!: number;
  tier!: string;
  isAffiliate!: boolean;
  affiliateCode!: string | null;
  referredBy!: string | null;
}
// Rewards transaction ledger
export class RewardsTransaction extends BaseSchema {
  accountId!: string;
  userId!: string;
  type!: string;
  points!: number;
  cashbackKobo!: number;
  description!: string;
  orderId!: string | null;
}
