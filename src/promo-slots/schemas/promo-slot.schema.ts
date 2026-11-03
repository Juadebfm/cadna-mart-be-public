import { BaseSchema } from '@shared/base/base.schema';
export enum PromoSlotStatus {
  AVAILABLE = 'available',
  PARTIALLY_BOOKED = 'partially_booked',
  FULL = 'full',
}
export class PromoSlot extends BaseSchema {
  slotTypeId!: string;
  date!: string;
  capacity!: number;
  bookedCount!: number;
  status!: PromoSlotStatus;
  startsAt!: Date;
  endsAt!: Date;
}
