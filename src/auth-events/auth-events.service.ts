import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '@database/prisma.service';
import { createPublicId } from '@database/id.util';
import { AuthEventKind } from './schemas/auth-event.schema';

type AuthEventRow = Prisma.AuthEventGetPayload<Record<string, never>>;
type AuthEventResponse = Omit<AuthEventRow, 'id'> & { _id: string };

function toAuthEventResponse(event: AuthEventRow): AuthEventResponse {
  const { id, ...fields } = event;
  return { ...fields, _id: id };
}

@Injectable()
export class AuthEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    userId: string | null,
    kind: AuthEventKind,
    options: { succeeded?: boolean; ip?: string | null; userAgent?: string | null } = {},
  ): Promise<void> {
    try {
      await this.prisma.authEvent.create({
        data: {
          id: createPublicId(),
          userId,
          kind,
          succeeded: options.succeeded ?? true,
          ip: options.ip ?? null,
          userAgent: options.userAgent ?? null,
        },
      });
    } catch {
      // Audit logging must never break an auth flow.
    }
  }

  async listForUser(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    items: AuthEventResponse[];
    pagination: { page: number; limit: number; totalItems: number; totalPages: number };
  }> {
    const cap = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const p = Math.max(Number(page) || 1, 1);
    const where = { userId };
    const [items, totalItems] = await Promise.all([
      this.prisma.authEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * cap,
        take: cap,
      }),
      this.prisma.authEvent.count({ where }),
    ]);

    return {
      items: items.map(toAuthEventResponse),
      pagination: {
        page: p,
        limit: cap,
        totalItems,
        totalPages: Math.ceil(totalItems / cap),
      },
    };
  }
}
