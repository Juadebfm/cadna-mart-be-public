import { BaseSchema } from '@shared/base/base.schema';
export enum WalletTransactionType {
  CREDIT = 'credit',
  DEBIT = 'debit',
  TOPUP = 'topup',
  TRANSFER = 'transfer',
  HOLD = 'hold',
  RELEASE = 'release',
  REFUND = 'refund',
}
export class WalletTransaction extends BaseSchema {
  walletId!: string;
  userId!: string;
  type!: WalletTransactionType;
  amountKobo!: number;
  runningBalanceKobo!: number;
  reference!: string | null;
  orderId!: string | null;
  description!: string;
}
