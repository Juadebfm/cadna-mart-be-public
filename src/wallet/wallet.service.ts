import { BadRequestException, Injectable } from '@nestjs/common';
import { WalletRepository } from './wallet.repository';
import { Wallet } from './schemas/wallet.schema';

function formatNGN(kobo: number): string {
  return '₦' + (kobo / 100).toLocaleString('en-NG');
}

function walletShape(wallet: Wallet): object {
  return {
    id: (wallet as unknown as { _id: { toString(): string } })._id.toString(),
    balance: {
      amount: wallet.balanceKobo,
      currency: 'NGN',
      formatted: formatNGN(wallet.balanceKobo),
    },
    tier: wallet.tier,
    holds: wallet.holds,
  };
}

@Injectable()
export class WalletService {
  constructor(private readonly repo: WalletRepository) {}

  async getWallet(userId: string): Promise<object> {
    const wallet = await this.repo.findOrCreateByUser(userId);
    return walletShape(wallet);
  }

  async getTransactions(userId: string, page: number, limit: number): Promise<object> {
    const wallet = await this.repo.findOrCreateByUser(userId);
    const walletId = (wallet as unknown as { _id: { toString(): string } })._id.toString();
    const { items, totalItems } = await this.repo.findTransactions(walletId, page, limit);
    return {
      items: items.map((tx) => ({
        id: (tx as unknown as { _id: { toString(): string } })._id.toString(),
        type: tx.type,
        amount: { amount: tx.amountKobo, currency: 'NGN', formatted: formatNGN(tx.amountKobo) },
        runningBalance: {
          amount: tx.runningBalanceKobo,
          currency: 'NGN',
          formatted: formatNGN(tx.runningBalanceKobo),
        },
        reference: tx.reference,
        orderId: tx.orderId,
        description: tx.description,
        createdAt: (tx as unknown as { createdAt: Date }).createdAt,
      })),
      meta: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };
  }

  async topupInitialize(userId: string, amountKobo: number): Promise<object> {
    if (amountKobo < 10000) throw new BadRequestException('Minimum top-up is ₦100');
    return {
      authorizationUrl: null,
      note: 'Wallet top-up via Paystack redirect will be wired in the payment-webhook handler. Integration deferred.',
      amountKobo,
      userId,
    };
  }

  async debit(
    userId: string,
    amountKobo: number,
    description: string,
    orderId?: string,
  ): Promise<object> {
    const wallet = await this.repo.findOrCreateByUser(userId);
    if (wallet.balanceKobo < amountKobo)
      throw new BadRequestException('Insufficient wallet balance');
    const walletId = (wallet as unknown as { _id: { toString(): string } })._id.toString();
    const { wallet: updated, tx } = await this.repo.debit(
      walletId,
      userId,
      amountKobo,
      description,
      undefined,
      orderId,
    );
    return {
      wallet: walletShape(updated),
      transactionId: (tx as unknown as { _id: { toString(): string } })._id.toString(),
    };
  }

  async credit(
    userId: string,
    amountKobo: number,
    description: string,
    reference?: string,
    orderId?: string,
  ): Promise<object> {
    const wallet = await this.repo.findOrCreateByUser(userId);
    const walletId = (wallet as unknown as { _id: { toString(): string } })._id.toString();
    const { wallet: updated, tx } = await this.repo.credit(
      walletId,
      userId,
      amountKobo,
      description,
      reference,
      orderId,
    );
    return {
      wallet: walletShape(updated),
      transactionId: (tx as unknown as { _id: { toString(): string } })._id.toString(),
    };
  }

  async transfer(
    userId: string,
    toUserId: string,
    amountKobo: number,
    note?: string,
  ): Promise<object> {
    return {
      note: 'Wallet-to-wallet transfer is deferred pending inter-account reconciliation design.',
      fromUserId: userId,
      toUserId,
      amountKobo,
      memo: note ?? null,
    };
  }

  async getHolds(userId: string): Promise<object> {
    const wallet = await this.repo.findOrCreateByUser(userId);
    return { holds: wallet.holds };
  }
}
