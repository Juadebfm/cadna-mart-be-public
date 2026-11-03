import { BaseSchema } from '@shared/base/base.schema';
export enum CartOwnerType {
  USER = 'user',
  GUEST = 'guest',
}
class CartItem {
  product!: string;
  variantId!: string | null;
  quantity!: number;
}
export class Cart extends BaseSchema {
  publicCartId!: string;
  ownerType!: CartOwnerType;
  user!: string | null;
  guestTokenHash!: string | null;
  expiresAt!: Date | null;
  items!: CartItem[];
}
