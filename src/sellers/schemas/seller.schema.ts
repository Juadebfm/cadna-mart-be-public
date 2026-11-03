import { BaseSchema } from '@shared/base/base.schema';
export class Seller extends BaseSchema {
  name!: string;
  slug!: string;
  logoUrl!: string | null;
  owner!: string;
  isVerified!: boolean;
  responseRatePercent!: number;
  averageRating!: number;
  reviewCount!: number;
  followerCount!: number;
  joinedYear!: number | null;
  location!: string | null;
  deliveryTimeRange!: string | null;
  isActive!: boolean;
}
