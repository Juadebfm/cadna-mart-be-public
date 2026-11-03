import { BaseSchema } from '@shared/base/base.schema';
export enum BannerType {
  HERO = 'hero',
  CAMPAIGN = 'campaign',
  FLASH_SALE = 'flash_sale',
  GROWTH_CARD = 'growth_card',
}
export class Banner extends BaseSchema {
  type!: BannerType;
  title!: string;
  subtitle!: string | null;
  description!: string | null;
  imageUrl!: string | null;
  mobileImageUrl!: string | null;
  ctaLabel!: string | null;
  ctaUrl!: string | null;
  discountLabel!: string | null;
  startAt!: Date | null;
  endAt!: Date | null;
  locations!: string[];
  order!: number;
  isActive!: boolean;
}
