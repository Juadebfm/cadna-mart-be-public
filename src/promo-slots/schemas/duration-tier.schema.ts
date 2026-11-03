import { BaseSchema } from '@shared/base/base.schema';
export class DurationTier extends BaseSchema {
  slotTypeId!: string;
  label!: string;
  durationHours!: number;
  priceNGN!: number;
  isActive!: boolean;
}
