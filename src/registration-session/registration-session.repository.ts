import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '@database/prisma.service';
import { createPublicId } from '@database/id.util';

export type RegistrationSessionRow = Prisma.RegistrationSessionGetPayload<Record<string, never>>;

@Injectable()
export class RegistrationSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Omit<Prisma.RegistrationSessionUncheckedCreateInput, 'id' | 'sessionId'>,
  ): Promise<RegistrationSessionRow> {
    await this.prisma.registrationSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return this.prisma.registrationSession.create({
      data: { ...data, id: createPublicId(), sessionId: randomUUID() },
    });
  }

  async findBySessionId(sessionId: string): Promise<RegistrationSessionRow | null> {
    return this.prisma.registrationSession.findFirst({
      where: { sessionId, expiresAt: { gt: new Date() } },
    });
  }

  async update(
    sessionId: string,
    data: Prisma.RegistrationSessionUpdateManyMutationInput,
  ): Promise<RegistrationSessionRow | null> {
    const result = await this.prisma.registrationSession.updateMany({
      where: { sessionId },
      data,
    });
    if (result.count === 0) return null;
    return this.prisma.registrationSession.findUnique({ where: { sessionId } });
  }

  async delete(sessionId: string): Promise<void> {
    await this.prisma.registrationSession.deleteMany({ where: { sessionId } });
  }
}
