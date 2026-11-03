import { BaseSchema } from '@shared/base/base.schema';
export class Category extends BaseSchema {
  name!: string;
  slug!: string;
  iconUrl!: string | null;
  parent!: string | null;
  productCount!: number;
  order!: number;
  isActive!: boolean;
}
