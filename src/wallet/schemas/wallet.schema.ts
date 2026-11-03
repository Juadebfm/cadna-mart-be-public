import { BaseSchema } from '@shared/base/base.schema';
export interface WalletHold {
  holdId: string;
  amount: number;
  orderId: string;
  expiresAt: Date;
}
export class Wallet extends BaseSchema {
  userId!: string;
  balanceKobo!: number;
  tier!: string;
  holds!: WalletHold[];
}
