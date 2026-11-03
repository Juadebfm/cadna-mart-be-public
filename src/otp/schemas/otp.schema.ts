import { OtpType } from '../enums/otp-type.enum';
export class Otp {
  userId!: string | null;
  email!: string;
  code!: string;
  type!: OtpType;
  expiresAt!: Date;
  isUsed!: boolean;
  attempts!: number;
  createdAt!: Date;
  updatedAt!: Date;
}
