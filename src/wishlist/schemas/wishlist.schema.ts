import { BaseSchema } from '@shared/base/base.schema';
export class WishlistItem extends BaseSchema {
  user!: string;
  product!: string;
}
