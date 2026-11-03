import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { createPublicId } from '@database/id.util';
import {
  PartnerProfile,
  PartnerCommitment,
  PartnerDispute,
  PartnerStatus,
} from './schemas/partner-profile.schema';

@Injectable()
export class PartnersRepository {
  constructor(private readonly prisma: PrismaService) {}
  private legacy(row: any): any {
    return row
      ? {
          ...row,
          _id: row.id,
          user: row.userId,
          approvedBy: row.approvedById,
          partnerId: row.partnerId,
          product: row.productId,
          commitmentId: row.commitmentId,
          resolvedBy: row.resolvedById,
        }
      : null;
  }
  async findOrCreateProfile(userId: string): Promise<PartnerProfile> {
    const row = await this.prisma.partnerProfile.upsert({
      where: { userId },
      create: { id: createPublicId(), userId },
      update: {},
    });
    return this.legacy(row);
  }
  async findProfileByUser(userId: string): Promise<PartnerProfile | null> {
    return this.legacy(
      await this.prisma.partnerProfile.findFirst({ where: { userId, deletedAt: null } }),
    );
  }
  async updateProfile(userId: string, update: Partial<PartnerProfile>): Promise<PartnerProfile> {
    const current = await this.prisma.partnerProfile.findUnique({ where: { userId } });
    const data: any = { ...(update as any) };
    if ('approvedBy' in data) {
      data.approvedById = data.approvedBy;
      delete data.approvedBy;
    }
    const row = current
      ? await this.prisma.partnerProfile.update({ where: { userId }, data })
      : await this.prisma.partnerProfile.create({
          data: { id: createPublicId(), userId, ...data },
        });
    return this.legacy(row);
  }
  async findAllProfiles(page: number, limit: number) {
    const where = { deletedAt: null };
    const [rows, totalItems] = await Promise.all([
      this.prisma.partnerProfile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.partnerProfile.count({ where }),
    ]);
    return { items: rows.map((row) => this.legacy(row)), totalItems };
  }
  async approveProfile(id: string, adminId: string): Promise<PartnerProfile> {
    try {
      return this.legacy(
        await this.prisma.partnerProfile.update({
          where: { id },
          data: { status: PartnerStatus.APPROVED, approvedById: adminId, approvedAt: new Date() },
        }),
      );
    } catch {
      throw new NotFoundException('Partner not found');
    }
  }
  async createCommitment(
    partnerId: string,
    productId: string,
    amountNGN: number,
  ): Promise<PartnerCommitment> {
    return this.legacy(
      await this.prisma.partnerCommitment.create({
        data: { id: createPublicId(), partnerId, productId, amountNGN },
      }),
    );
  }
  async findCommitmentsByPartner(partnerId: string, page: number, limit: number) {
    const where = { partnerId, deletedAt: null };
    const [rows, totalItems] = await Promise.all([
      this.prisma.partnerCommitment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.partnerCommitment.count({ where }),
    ]);
    return { items: rows.map((row) => this.legacy(row)), totalItems };
  }
  async findCommitmentById(id: string): Promise<PartnerCommitment | null> {
    return this.legacy(await this.prisma.partnerCommitment.findUnique({ where: { id } }));
  }
  async approveCommitment(id: string, adminId: string): Promise<PartnerCommitment> {
    try {
      return this.legacy(
        await this.prisma.partnerCommitment.update({
          where: { id },
          data: { status: 'approved', approvedById: adminId, approvedAt: new Date() },
        }),
      );
    } catch {
      throw new NotFoundException('Commitment not found');
    }
  }
  async findAllCommitments(page: number, limit: number) {
    const where = { deletedAt: null };
    const [rows, totalItems] = await Promise.all([
      this.prisma.partnerCommitment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.partnerCommitment.count({ where }),
    ]);
    return { items: rows.map((row) => this.legacy(row)), totalItems };
  }
  async createDispute(
    partnerId: string,
    commitmentId: string,
    reason: string,
  ): Promise<PartnerDispute> {
    return this.legacy(
      await this.prisma.partnerDispute.create({
        data: { id: createPublicId(), partnerId, commitmentId, reason },
      }),
    );
  }
  async resolveDispute(id: string, adminId: string, resolution: string): Promise<PartnerDispute> {
    try {
      return this.legacy(
        await this.prisma.partnerDispute.update({
          where: { id },
          data: { status: 'resolved', resolvedById: adminId, resolution },
        }),
      );
    } catch {
      throw new NotFoundException('Dispute not found');
    }
  }
}
