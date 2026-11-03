import { Injectable } from '@nestjs/common';
import { Prisma, SupportTicketEventOutbox } from '../generated/prisma/client';
import type { SupportTicketGetPayload } from '../generated/prisma/models/SupportTicket';
import type { SupportTicketMessageUncheckedCreateInput } from '../generated/prisma/models/SupportTicketMessage';
import { PrismaService } from '@database/prisma.service';
import { createPublicId } from '@database/id.util';
import { SupportTicket, TicketStatus } from './schemas/support-ticket.schema';

type TicketMessageInput = NonNullable<SupportTicket['messages']>[number];
type TicketWithMessages = SupportTicketGetPayload<{
  include: {
    messages: { orderBy: { sequence: 'asc' } };
    privateAttachments: { where: { deletedAt: null }; orderBy: { createdAt: 'asc' } };
  };
}>;
type PrivateAttachmentInput = {
  storageKey: string;
  resourceType: string;
  format: string;
  originalFileName: string;
  contentType: string;
  sizeBytes: number;
};

@Injectable()
export class SupportRepository {
  constructor(private readonly prisma: PrismaService) {}

  private legacy(row: TicketWithMessages | null): SupportTicket | null {
    if (!row) return null;
    return {
      ...row,
      _id: row.id,
      assignedTo: row.assignedToId,
      messages: row.messages.map((message) => ({
        id: message.id,
        sequence: message.sequence,
        clientMessageId: message.clientMessageId,
        authorId: message.authorUserId ?? 'system',
        authorRole: message.authorRole,
        body: message.body,
        sentAt: message.sentAt,
      })),
      privateAttachments: row.privateAttachments.map((attachment) => ({
        id: attachment.id,
        originalFileName: attachment.originalFileName,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes,
        createdAt: attachment.createdAt,
      })),
    } as unknown as SupportTicket;
  }

  private ticketMessageData(
    ticketId: string,
    message: TicketMessageInput,
    sequence: number,
  ): SupportTicketMessageUncheckedCreateInput {
    const authorId = message.authorId;
    return {
      id: message.id ?? createPublicId(),
      ticketId,
      authorUserId:
        message.authorRole === 'guest' || message.authorRole === 'system' ? null : authorId,
      authorRole: message.authorRole,
      body: message.body,
      sequence,
      clientMessageId: message.clientMessageId ?? null,
      sentAt: message.sentAt,
    };
  }

  private async enqueueEvent(
    tx: Prisma.TransactionClient,
    ticketId: string,
    eventType: string,
    payload: Prisma.InputJsonValue,
  ): Promise<void> {
    await tx.supportTicketEventOutbox.create({
      data: { id: createPublicId(), ticketId, eventType, payload },
    });
  }

  async findAccessibleOrder(userId: string, accountType: string, reference: string) {
    const cleaned = reference.trim().replace(/^#/, '');
    const normalized = /^[a-f0-9]{24}$/i.test(cleaned)
      ? cleaned.toLowerCase()
      : cleaned.toUpperCase();
    const rows = await this.prisma.$queryRaw<Array<{ id: string; orderRef: string }>>`
      SELECT orders."id", orders."orderRef"
      FROM "orders" AS orders
      WHERE (orders."orderRef" = ${normalized} OR orders."id" = ${normalized})
        AND (
          (${accountType} = 'buyer' AND orders."userId" = ${userId})
          OR (
            ${accountType} = 'seller'
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(orders."items") = 'array' THEN orders."items" ELSE '[]'::jsonb END
              ) AS item(value)
              JOIN "stores" AS seller ON seller."id" = item.value->>'sellerId'
              WHERE seller."ownerId" = ${userId}
            )
          )
        )
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async create(
    data: Partial<SupportTicket>,
    attachments: PrivateAttachmentInput[] = [],
  ): Promise<SupportTicket> {
    const value = data as any;
    const initialMessages: TicketMessageInput[] = value.messages ?? [];
    const id = createPublicId();

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.supportTicket.create({
        data: {
          id,
          userId: value.userId ?? null,
          accountType: value.accountType ?? 'buyer',
          guestEmail: value.guestEmail ?? null,
          subject: value.subject,
          body: value.body,
          category: value.category ?? 'other',
          status: value.status ?? 'open',
          assignedToId: value.assignedTo ?? null,
          orderId: value.orderId ?? null,
          attachments: (value.attachments ?? []) as Prisma.InputJsonValue,
          closedAt: value.closedAt ?? null,
          withdrawnAt: value.withdrawnAt ?? null,
        },
      });

      for (const [index, message] of initialMessages.entries()) {
        await tx.supportTicketMessage.create({
          data: this.ticketMessageData(id, message, index + 1),
        });
      }

      if (attachments.length) {
        await tx.supportTicketAttachment.createMany({
          data: attachments.map((attachment) => ({
            id: createPublicId(),
            ticketId: id,
            uploadedById: value.userId,
            ...attachment,
          })),
        });
      }

      return tx.supportTicket.findUniqueOrThrow({
        where: { id },
        include: {
          messages: { orderBy: { sequence: 'asc' } },
          privateAttachments: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
        },
      });
    });

    return this.legacy(row)!;
  }

  async findById(id: string): Promise<SupportTicket | null> {
    return this.legacy(
      await this.prisma.supportTicket.findUnique({
        where: { id },
        include: {
          messages: { orderBy: { sequence: 'asc' } },
          privateAttachments: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
        },
      }),
    );
  }

  async findByUserAndId(
    userId: string,
    accountType: string,
    id: string,
  ): Promise<SupportTicket | null> {
    return this.legacy(
      await this.prisma.supportTicket.findFirst({
        where: { id, userId, accountType, withdrawnAt: null },
        include: {
          messages: { orderBy: { sequence: 'asc' } },
          privateAttachments: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
        },
      }),
    );
  }

  async findByUser(userId: string, accountType: string, page: number, limit: number) {
    const where = { userId, accountType, withdrawnAt: null };
    const [rows, totalItems] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        include: {
          messages: { orderBy: { sequence: 'asc' } },
          privateAttachments: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return { items: rows.map((row) => this.legacy(row)!), totalItems };
  }

  async findMessagesAfter(ticketId: string, afterSequence: number, limit: number) {
    const rows = await this.prisma.supportTicketMessage.findMany({
      where: { ticketId, sequence: { gt: afterSequence } },
      orderBy: { sequence: 'asc' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((message) => ({
      id: message.id,
      sequence: message.sequence,
      clientMessageId: message.clientMessageId,
      authorId: message.authorUserId ?? 'system',
      authorRole: message.authorRole,
      body: message.body,
      sentAt: message.sentAt,
    }));
    return {
      items,
      nextSequence: items.at(-1)?.sequence ?? afterSequence,
      hasMore,
    };
  }

  async findMessageById(ticketId: string, messageId: string) {
    return this.prisma.supportTicketMessage.findFirst({ where: { id: messageId, ticketId } });
  }

  async findMessageByClientId(ticketId: string, clientMessageId: string) {
    const message = await this.prisma.supportTicketMessage.findFirst({
      where: { ticketId, clientMessageId },
    });
    return message
      ? {
          id: message.id,
          sequence: message.sequence,
          clientMessageId: message.clientMessageId,
          authorId: message.authorUserId ?? 'system',
          authorRole: message.authorRole,
          body: message.body,
          sentAt: message.sentAt,
        }
      : null;
  }

  async findAttachmentForTicket(ticketId: string, attachmentId: string) {
    return this.prisma.supportTicketAttachment.findFirst({
      where: { ticketId, id: attachmentId, deletedAt: null },
    });
  }

  async claimOutboxEvents(limit = 100): Promise<SupportTicketEventOutbox[]> {
    return this.prisma.$transaction(
      (tx) =>
        tx.$queryRaw<SupportTicketEventOutbox[]>`
        WITH due AS (
          SELECT "id"
          FROM "support_ticket_event_outbox"
          WHERE "publishedAt" IS NULL
            AND "availableAt" <= NOW()
            AND ("lockedUntil" IS NULL OR "lockedUntil" <= NOW())
          ORDER BY "createdAt"
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "support_ticket_event_outbox" AS event
        SET "attempts" = event."attempts" + 1,
            "lockedUntil" = NOW() + INTERVAL '30 seconds',
            "updatedAt" = NOW()
        FROM due
        WHERE event."id" = due."id"
        RETURNING event.*
      `,
    );
  }

  async markOutboxPublished(id: string): Promise<void> {
    await this.prisma.supportTicketEventOutbox.update({
      where: { id },
      data: { publishedAt: new Date(), lockedUntil: null, lastError: null },
    });
  }

  async retryOutboxEvent(id: string, attempts: number, error: string): Promise<void> {
    const delaySeconds = Math.min(300, 2 ** Math.min(attempts, 8));
    await this.prisma.supportTicketEventOutbox.update({
      where: { id },
      data: {
        availableAt: new Date(Date.now() + delaySeconds * 1000),
        lockedUntil: null,
        lastError: error.slice(0, 500),
      },
    });
  }

  async findAll(page: number, limit: number, status?: TicketStatus, assignedTo?: string) {
    const where = {
      ...(status ? { status } : {}),
      ...(assignedTo ? { assignedToId: assignedTo } : {}),
    };
    const [rows, totalItems] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        include: {
          messages: { orderBy: { sequence: 'asc' } },
          privateAttachments: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return { items: rows.map((row) => this.legacy(row)!), totalItems };
  }

  async update(id: string, data: Partial<SupportTicket>): Promise<SupportTicket | null> {
    const value: any = { ...(data as any) };
    delete value.messages;
    if ('assignedTo' in value) {
      value.assignedToId = value.assignedTo;
      delete value.assignedTo;
    }
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.supportTicket.update({ where: { id }, data: value });
        await this.enqueueEvent(tx, id, 'ticket.updated', {
          ticketId: id,
          status: updated.status,
          accountType: updated.accountType,
          withdrawnAt: updated.withdrawnAt?.toISOString() ?? null,
          notifyUser: true,
        });
        return tx.supportTicket.findUniqueOrThrow({
          where: { id },
          include: {
            messages: { orderBy: { sequence: 'asc' } },
            privateAttachments: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
          },
        });
      });
      return this.legacy(row);
    } catch {
      return null;
    }
  }

  async updateForUser(
    userId: string,
    accountType: string,
    id: string,
    data: Partial<SupportTicket>,
  ): Promise<SupportTicket | null> {
    const value: any = { ...(data as any) };
    delete value.messages;
    if ('assignedTo' in value) {
      value.assignedToId = value.assignedTo;
      delete value.assignedTo;
    }
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.supportTicket.findFirst({
        where: { id, userId, accountType, withdrawnAt: null },
      });
      if (!current) return null;
      const updated = await tx.supportTicket.update({ where: { id }, data: value });
      await this.enqueueEvent(tx, id, 'ticket.updated', {
        ticketId: id,
        status: updated.status,
        accountType: updated.accountType,
        withdrawnAt: updated.withdrawnAt?.toISOString() ?? null,
        notifyUser: false,
      });
      const withMessages = await tx.supportTicket.findUniqueOrThrow({
        where: { id },
        include: {
          messages: { orderBy: { sequence: 'asc' } },
          privateAttachments: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
        },
      });
      return this.legacy(withMessages);
    });
  }

  private async appendMessage(
    tx: Prisma.TransactionClient,
    id: string,
    message: TicketMessageInput,
  ): Promise<boolean> {
    await tx.$queryRaw`SELECT id FROM support_tickets WHERE id = ${id} FOR UPDATE`;
    const ticket = await tx.supportTicket.findUnique({ where: { id } });
    if (!ticket || ticket.status === 'closed' || ticket.withdrawnAt) return false;

    if (message.clientMessageId) {
      const duplicate = await tx.supportTicketMessage.findUnique({
        where: {
          ticketId_clientMessageId: { ticketId: id, clientMessageId: message.clientMessageId },
        },
      });
      if (duplicate) return true;
    }

    const lastMessage = await tx.supportTicketMessage.findFirst({
      where: { ticketId: id },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    const created = await tx.supportTicketMessage.create({
      data: this.ticketMessageData(id, message, (lastMessage?.sequence ?? 0) + 1),
    });
    await this.enqueueEvent(tx, id, 'ticket.message.created', {
      ticketId: id,
      messageId: created.id,
      accountType: ticket.accountType,
    });
    return true;
  }

  async pushMessageForUser(
    userId: string,
    accountType: string,
    id: string,
    message: TicketMessageInput,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.findFirst({
        where: { id, userId, accountType, withdrawnAt: null },
      });
      if (!ticket) return false;
      return this.appendMessage(tx, id, message);
    });
  }

  async pushMessage(id: string, message: TicketMessageInput): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => this.appendMessage(tx, id, message));
  }
}
