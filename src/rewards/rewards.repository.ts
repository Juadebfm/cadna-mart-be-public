import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { createPublicId } from '@database/id.util';
import {
  RewardsProgram,
  RewardsTier,
  RewardsCampaign,
  RewardsAccount,
  RewardsTransaction,
} from './schemas/rewards.schema';

@Injectable()
export class RewardsRepository {
  constructor(private readonly prisma: PrismaService) {}
  private legacy(row: any): any {
    return row ? { ...row, _id: row.id } : null;
  }

  async getProgram(): Promise<RewardsProgram | null> {
    return this.legacy(
      await this.prisma.rewardsProgram.findFirst({ where: { slug: 'default', deletedAt: null } }),
    );
  }
  async upsertProgram(data: Partial<RewardsProgram>): Promise<RewardsProgram> {
    const v = data as any;
    return this.legacy(
      await this.prisma.rewardsProgram.upsert({
        where: { slug: 'default' },
        create: {
          id: createPublicId(),
          slug: 'default',
          name: v.name ?? 'Rewards',
          tagline: v.tagline ?? null,
          logoUrl: v.logoUrl ?? null,
        },
        update: {
          ...(v.name !== undefined ? { name: v.name } : {}),
          ...(v.tagline !== undefined ? { tagline: v.tagline } : {}),
          ...(v.logoUrl !== undefined ? { logoUrl: v.logoUrl } : {}),
        },
      }),
    );
  }
  async findTiers(): Promise<RewardsTier[]> {
    return (
      await this.prisma.rewardsTier.findMany({
        where: { deletedAt: null },
        orderBy: { minPoints: 'asc' },
      })
    ).map((row) => this.legacy(row));
  }
  async createTier(data: Partial<RewardsTier>): Promise<RewardsTier> {
    const v = data as any;
    return this.legacy(
      await this.prisma.rewardsTier.create({
        data: {
          id: createPublicId(),
          name: v.name,
          minPoints: v.minPoints,
          maxPoints: v.maxPoints ?? null,
          cashbackRate: v.cashbackRate,
        },
      }),
    );
  }
  async updateTier(id: string, data: Partial<RewardsTier>): Promise<RewardsTier> {
    try {
      return this.legacy(
        await this.prisma.rewardsTier.update({ where: { id }, data: data as any }),
      );
    } catch {
      throw new NotFoundException('Tier not found');
    }
  }
  async deleteTier(id: string): Promise<void> {
    await this.prisma.rewardsTier.updateMany({ where: { id }, data: { deletedAt: new Date() } });
  }
  async findActiveCampaigns(): Promise<RewardsCampaign[]> {
    const now = new Date();
    return (
      await this.prisma.rewardsCampaign.findMany({
        where: { isActive: true, startsAt: { lte: now }, endsAt: { gte: now }, deletedAt: null },
      })
    ).map((row) => this.legacy(row));
  }
  async findAllCampaigns(): Promise<RewardsCampaign[]> {
    return (
      await this.prisma.rewardsCampaign.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
      })
    ).map((row) => this.legacy(row));
  }
  async createCampaign(data: Partial<RewardsCampaign>): Promise<RewardsCampaign> {
    const v = data as any;
    return this.legacy(
      await this.prisma.rewardsCampaign.create({
        data: {
          id: createPublicId(),
          name: v.name,
          startsAt: v.startsAt,
          endsAt: v.endsAt,
          pointsMultiplier: v.pointsMultiplier ?? 1,
          isActive: v.isActive ?? true,
        },
      }),
    );
  }
  async updateCampaign(id: string, data: Partial<RewardsCampaign>): Promise<RewardsCampaign> {
    try {
      return this.legacy(
        await this.prisma.rewardsCampaign.update({ where: { id }, data: data as any }),
      );
    } catch {
      throw new NotFoundException('Campaign not found');
    }
  }
  async deleteCampaign(id: string): Promise<void> {
    await this.prisma.rewardsCampaign.updateMany({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
  async findOrCreateAccount(userId: string): Promise<RewardsAccount> {
    return this.legacy(
      await this.prisma.rewardsAccount.upsert({
        where: { userId },
        create: { id: createPublicId(), userId },
        update: {},
      }),
    );
  }
  async updateAccount(userId: string, update: Partial<RewardsAccount>): Promise<RewardsAccount> {
    const v = { ...(update as any) };
    delete v.id;
    delete v._id;
    delete v.userId;
    return this.legacy(
      await this.prisma.rewardsAccount.upsert({
        where: { userId },
        create: { id: createPublicId(), userId, ...v },
        update: v,
      }),
    );
  }
  async findTransactions(accountId: string, page: number, limit: number) {
    const where = { accountId, deletedAt: null };
    const [rows, totalItems] = await Promise.all([
      this.prisma.rewardsTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.rewardsTransaction.count({ where }),
    ]);
    return { items: rows.map((row) => this.legacy(row)), totalItems };
  }
  async createTransaction(data: Partial<RewardsTransaction>): Promise<RewardsTransaction> {
    const v = data as any;
    return this.legacy(
      await this.prisma.rewardsTransaction.create({
        data: {
          id: createPublicId(),
          accountId: String(v.accountId),
          userId: String(v.userId),
          type: v.type,
          points: v.points ?? 0,
          cashbackKobo: v.cashbackKobo ?? 0,
          description: v.description,
          orderId: v.orderId ?? null,
        },
      }),
    );
  }
}
