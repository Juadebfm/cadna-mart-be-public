import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '@database/prisma.service';
import { createPublicId } from '@database/id.util';

export type PendingBuyerSignupRow = Prisma.PendingBuyerSignupGetPayload<Record<string, never>>;

@Injectable()
export class PendingBuyerSignupRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Omit<Prisma.PendingBuyerSignupUncheckedCreateInput, 'id'>,
  ): Promise<PendingBuyerSignupRow> {
    await this.prisma.pendingBuyerSignup.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return this.prisma.pendingBuyerSignup.create({ data: { ...data, id: createPublicId() } });
  }

  async findByEmail(email: string): Promise<PendingBuyerSignupRow | null> {
    return this.prisma.pendingBuyerSignup.findFirst({
      where: { email: email.trim().toLowerCase(), expiresAt: { gt: new Date() } },
    });
  }

  async deleteByEmail(email: string): Promise<void> {
    await this.prisma.pendingBuyerSignup.deleteMany({
      where: { email: email.trim().toLowerCase() },
    });
  }
}
