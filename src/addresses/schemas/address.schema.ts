import { BaseSchema } from '@shared/base/base.schema';
export class Address extends BaseSchema {
  userId!: string;
  label!: string | null;
  recipientName!: string;
  phoneNumber!: string;
  street1!: string;
  street2!: string | null;
  city!: string;
  state!: string;
  country!: string;
  postalCode!: string | null;
  notes!: string | null;
  isDefault!: boolean;
}
