import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { createPublicId } from '@database/id.util';
import { Wallet } from './schemas/wallet.schema';
import { WalletTransaction, WalletTransactionType } from './schemas/wallet-transaction.schema';

@Injectable()
export class WalletRepository {
  constructor(private readonly prisma: PrismaService) {}
  private wallet(row: any): Wallet {
    return { ...row, _id: row.id } as unknown as Wallet;
  }
  private transaction(row: any): WalletTransaction {
    return { ...row, _id: row.id } as unknown as WalletTransaction;
  }

  async findOrCreateByUser(userId: string): Promise<Wallet> {
    const row = await this.prisma.wallet.upsert({
      where: { userId },
      create: { id: createPublicId(), userId },
      update: {},
    });
    return this.wallet(row);
  }

  async findByUser(userId: string): Promise<Wallet | null> {
    const row = await this.prisma.wallet.findFirst({ where: { userId, deletedAt: null } });
    return row ? this.wallet(row) : null;
  }

  async credit(
    walletId: string,
    userId: string,
    amountKobo: number,
    description: string,
    reference?: string,
    orderId?: string,
  ): Promise<{ wallet: Wallet; tx: WalletTransaction }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${walletId} FOR UPDATE`;
      const current = await tx.wallet.findFirst({ where: { id: walletId, deletedAt: null } });
      if (!current) throw new NotFoundException('Wallet not found');
      const updated = await tx.wallet.update({
        where: { id: walletId },
        data: { balanceKobo: { increment: amountKobo } },
      });
      const transaction = await tx.walletTransaction.create({
        data: {
          id: createPublicId(),
          walletId,
          userId,
          type: WalletTransactionType.CREDIT,
          amountKobo,
          runningBalanceKobo: updated.balanceKobo,
          reference: reference ?? null,
          orderId: orderId ?? null,
          description,
        },
      });
      return { wallet: this.wallet(updated), tx: this.transaction(transaction) };
    });
  }

  async debit(
    walletId: string,
    userId: string,
    amountKobo: number,
    description: string,
    reference?: string,
    orderId?: string,
  ): Promise<{ wallet: Wallet; tx: WalletTransaction }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${walletId} FOR UPDATE`;
      const current = await tx.wallet.findFirst({ where: { id: walletId, deletedAt: null } });
      if (!current) throw new NotFoundException('Wallet not found');
      if (current.balanceKobo < amountKobo)
        throw new BadRequestException('Insufficient wallet balance');
      const updated = await tx.wallet.update({
        where: { id: walletId },
        data: { balanceKobo: { decrement: amountKobo } },
      });
      const transaction = await tx.walletTransaction.create({
        data: {
          id: createPublicId(),
          walletId,
          userId,
          type: WalletTransactionType.DEBIT,
          amountKobo,
          runningBalanceKobo: updated.balanceKobo,
          reference: reference ?? null,
          orderId: orderId ?? null,
          description,
        },
      });
      return { wallet: this.wallet(updated), tx: this.transaction(transaction) };
    });
  }

  async findTransactions(walletId: string, page: number, limit: number) {
    const where = { walletId };
    const [rows, totalItems] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);
    return { items: rows.map((row) => this.transaction(row)), totalItems };
  }
}
