import { BaseSchema } from '@shared/base/base.schema';
export enum SlotPlacement {
  FLASH_SALE = 'flash_sale',
  BEST_DEAL = 'best_deal',
  FEATURED = 'featured',
}
export class SlotType extends BaseSchema {
  name!: string;
  placement!: SlotPlacement;
  maxItems!: number;
  isActive!: boolean;
  description!: string | null;
}
