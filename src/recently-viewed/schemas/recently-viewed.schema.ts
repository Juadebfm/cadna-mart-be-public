import { BaseSchema } from '@shared/base/base.schema';
export class RecentlyViewed extends BaseSchema {
  user!: string;
  product!: string;
  viewedAt!: Date;
}
