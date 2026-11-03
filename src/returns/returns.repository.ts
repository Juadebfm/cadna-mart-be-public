import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { createPublicId } from '@database/id.util';
import { RefundStatus, ReturnRequest, ReturnStatus } from './schemas/return-request.schema';

@Injectable()
export class ReturnsRepository {
  constructor(private readonly prisma: PrismaService) {}
  private legacy(row: any): ReturnRequest | null {
    return row
      ? ({
          ...row,
          _id: row.id,
          adminOverrideBy: row.adminOverrideById,
        } as unknown as ReturnRequest)
      : null;
  }
  private json(value: unknown) {
    return value as any;
  }
  async create(input: Partial<ReturnRequest>): Promise<ReturnRequest> {
    const v = input as any;
    return this.legacy(
      await this.prisma.returnRequest.create({
        data: {
          id: createPublicId(),
          userId: String(v.userId),
          orderId: String(v.orderId),
          requestType: v.requestType ?? 'item_return',
          previousOrderStatus: v.previousOrderStatus ?? null,
          items: this.json(v.items ?? []),
          orderRef: v.orderRef,
          orderItemProductId: v.orderItemProductId,
          orderItemVariantId: v.orderItemVariantId ?? null,
          orderItemName: v.orderItemName,
          quantity: v.quantity,
          reason: v.reason,
          description: v.description ?? null,
          evidenceUrls: v.evidenceUrls ?? [],
          status: v.status ?? ReturnStatus.PENDING,
          sellerDecision: v.sellerDecision ?? null,
          sellerDecisionNote: v.sellerDecisionNote ?? null,
          sellerDecidedAt: v.sellerDecidedAt ?? null,
          adminOverrideNote: v.adminOverrideNote ?? null,
          adminOverrideById: v.adminOverrideBy ? String(v.adminOverrideBy) : null,
          refundStatus: v.refundStatus ?? null,
          refundMethod: v.refundMethod ?? null,
          refundReference: v.refundReference ?? null,
          refundProviderId: v.refundProviderId ?? null,
          refundProcessedAt: v.refundProcessedAt ?? null,
          refundAmount: v.refundAmount ?? 0,
          paymentReference: v.paymentReference ?? null,
          refundProviderStatus: v.refundProviderStatus ?? null,
          adjustmentReason: v.adjustmentReason ?? null,
        },
      }),
    )!;
  }
  async findById(id: string): Promise<ReturnRequest | null> {
    return this.legacy(
      await this.prisma.returnRequest.findFirst({ where: { id, deletedAt: null } }),
    );
  }
  async findByOrderId(orderId: string): Promise<ReturnRequest[]> {
    return (await this.prisma.returnRequest.findMany({ where: { orderId, deletedAt: null } })).map(
      (row) => this.legacy(row)!,
    );
  }
  async findByIdAndUser(id: string, userId: string): Promise<ReturnRequest | null> {
    return this.legacy(
      await this.prisma.returnRequest.findFirst({ where: { id, userId, deletedAt: null } }),
    );
  }
  async findProcessingByProviderRefund(
    paymentReference: string,
    refundReference?: string,
    refundProviderId?: string,
  ): Promise<ReturnRequest | null> {
    const OR = [
      refundReference ? { refundReference } : null,
      refundProviderId ? { refundProviderId } : null,
    ].filter(Boolean) as any[];
    if (!OR.length) return null;
    return this.legacy(
      await this.prisma.returnRequest.findFirst({
        where: { paymentReference, refundStatus: RefundStatus.PROCESSING, deletedAt: null, OR },
      }),
    );
  }
  async applyFinalProviderStatus(
    id: string,
    status: RefundStatus,
    providerStatus: string,
    refundReference: string | null,
  ): Promise<ReturnRequest | null> {
    const result = await this.prisma.returnRequest.updateMany({
      where: { id, deletedAt: null, refundStatus: RefundStatus.PROCESSING },
      data: {
        refundStatus: status,
        refundProviderStatus: providerStatus,
        refundReference,
        ...(status === RefundStatus.COMPLETED ? { status: ReturnStatus.COMPLETED } : {}),
      },
    });
    return result.count ? this.findById(id) : null;
  }
  async findByUserId(userId: string, page: number, limit: number) {
    const where = { userId, deletedAt: null };
    const [rows, totalItems] = await Promise.all([
      this.prisma.returnRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.returnRequest.count({ where }),
    ]);
    return { items: rows.map((row) => this.legacy(row)!), totalItems };
  }
  async findAll(page: number, limit: number, status?: ReturnStatus) {
    const where = { deletedAt: null, ...(status ? { status } : {}) };
    const [rows, totalItems] = await Promise.all([
      this.prisma.returnRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.returnRequest.count({ where }),
    ]);
    return { items: rows.map((row) => this.legacy(row)!), totalItems };
  }
  async findRefunds(page: number, limit: number) {
    const where = { deletedAt: null, refundStatus: { not: null } };
    const [rows, totalItems] = await Promise.all([
      this.prisma.returnRequest.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.returnRequest.count({ where }),
    ]);
    return { items: rows.map((row) => this.legacy(row)!), totalItems };
  }
  async findByOrderAndSeller(
    orderId: string,
    sellerProductIds: string[],
    page: number,
    limit: number,
  ) {
    return this.findByItems(orderId, sellerProductIds, page, limit);
  }
  async findAllBySeller(productIds: string[], page: number, limit: number) {
    return this.findByItems(undefined, productIds, page, limit);
  }
  private async findByItems(
    orderId: string | undefined,
    productIds: string[],
    page: number,
    limit: number,
  ) {
    const rows = await this.prisma.returnRequest.findMany({
      where: { deletedAt: null, ...(orderId ? { orderId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    const ids = new Set(productIds);
    const matched = rows.filter(
      (row) =>
        Array.isArray(row.items) &&
        (row.items as any[]).some((item) => ids.has(item.sellerId) || ids.has(item.productId)),
    );
    return {
      items: matched.slice((page - 1) * limit, page * limit).map((row) => this.legacy(row)!),
      totalItems: matched.length,
    };
  }
  async update(id: string, data: Partial<ReturnRequest>): Promise<ReturnRequest | null> {
    const v: any = { ...(data as any) };
    if ('adminOverrideBy' in v) {
      v.adminOverrideById = v.adminOverrideBy == null ? null : String(v.adminOverrideBy);
      delete v.adminOverrideBy;
    }
    if ('items' in v) v.items = this.json(v.items);
    try {
      return this.legacy(await this.prisma.returnRequest.update({ where: { id }, data: v }));
    } catch {
      return null;
    }
  }
  async startRefund(id: string, data: Partial<ReturnRequest>): Promise<ReturnRequest | null> {
    const current = await this.prisma.returnRequest.findFirst({
      where: {
        id,
        deletedAt: null,
        status: ReturnStatus.APPROVED,
        OR: [{ refundStatus: null }, { refundStatus: RefundStatus.FAILED }],
      },
    });
    return current ? this.update(id, data) : null;
  }
  async decideByAdmin(id: string, data: Partial<ReturnRequest>): Promise<ReturnRequest | null> {
    const allowed = [ReturnStatus.PENDING, ReturnStatus.APPROVED, ReturnStatus.REJECTED];
    const current = await this.prisma.returnRequest.findFirst({
      where: { id, deletedAt: null, status: { in: allowed }, refundStatus: null },
    });
    return current ? this.update(id, data) : null;
  }
  async cancelPending(id: string, userId: string): Promise<ReturnRequest | null> {
    const result = await this.prisma.returnRequest.updateMany({
      where: { id, userId, deletedAt: null, status: ReturnStatus.PENDING, refundStatus: null },
      data: { status: ReturnStatus.CANCELLED },
    });
    return result.count ? this.findById(id) : null;
  }
  async decideForSeller(
    id: string,
    sellerId: string,
    decision: 'approved' | 'rejected',
    note: string | null,
  ): Promise<ReturnRequest | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM return_requests WHERE id = ${id} FOR UPDATE`;
      const row = await tx.returnRequest.findFirst({
        where: { id, deletedAt: null, status: ReturnStatus.PENDING },
      });
      if (!row || !Array.isArray(row.items)) return null;
      const items = (row.items as any[]).map((item) =>
        item.sellerId === sellerId && item.sellerDecision === 'pending'
          ? {
              ...item,
              sellerDecision: decision,
              sellerDecisionNote: note,
              sellerDecidedAt: new Date(),
            }
          : item,
      );
      if (JSON.stringify(items) === JSON.stringify(row.items)) return null;
      return this.legacy(
        await tx.returnRequest.update({ where: { id }, data: { items: this.json(items) } }),
      );
    });
  }
}
