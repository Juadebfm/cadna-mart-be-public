import { BaseSchema } from '@shared/base/base.schema';
export class Review extends BaseSchema {
  product!: string;
  user!: string;
  rating!: number;
  title!: string | null;
  comment!: string | null;
  reviewerName!: string;
  isVerifiedPurchase!: boolean;
  helpfulCount!: number;
  moderationStatus!: string;
  moderationReason!: string | null;
  moderatedAt!: Date | null;
  moderatedBy!: string | null;
}
