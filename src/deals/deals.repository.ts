import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { createPublicId } from '@database/id.util';
import { DealCampaign } from './schemas/deal-campaign.schema';
import { DealCampaignQueryDto } from './dto/deal-campaign-query.dto';

@Injectable()
export class DealsRepository {
  constructor(public readonly prisma: PrismaService) {}
  private legacy(row: any): DealCampaign | null {
    return row
      ? ({
          ...row,
          _id: row.id,
          seller: row.seller
            ? { ...row.seller, _id: row.seller.id, owner: row.seller.ownerId }
            : null,
          approvedBy: row.approvedById,
        } as unknown as DealCampaign)
      : null;
  }
  async create(data: Partial<DealCampaign>): Promise<DealCampaign> {
    const value = data as any;
    const row = await this.prisma.dealCampaign.create({
      data: {
        id: createPublicId(),
        sellerId: String(value.seller),
        title: value.title,
        selectedProductIds: (value.selectedProductIds ?? []).map(String),
        maxProducts: value.maxProducts ?? 10,
        feeAmount: value.feeAmount,
        currency: value.currency ?? 'NGN',
        status: value.status ?? 'draft',
        paymentStatus: value.paymentStatus ?? 'unpaid',
        paymentReference: value.paymentReference ?? null,
        paymentAuthorizationUrl: value.paymentAuthorizationUrl ?? null,
        paymentAccessCode: value.paymentAccessCode ?? null,
        paidAt: value.paidAt ?? null,
        startsAt: value.startsAt ?? null,
        endsAt: value.endsAt ?? null,
        approvedById: value.approvedBy ? String(value.approvedBy) : null,
        approvedAt: value.approvedAt ?? null,
        isActive: value.isActive ?? true,
        deletedAt: value.deletedAt ?? null,
      },
    });
    return this.legacy(row)!;
  }
  private include = { seller: { include: { owner: { select: { id: true } } } } } as const;
  async findById(id: string): Promise<DealCampaign | null> {
    return this.legacy(
      await this.prisma.dealCampaign.findFirst({
        where: { id, deletedAt: null },
        include: this.include,
      }),
    );
  }
  async findByIdForSeller(id: string, sellerId: string): Promise<DealCampaign | null> {
    return this.legacy(
      await this.prisma.dealCampaign.findFirst({
        where: { id, sellerId, deletedAt: null },
        include: this.include,
      }),
    );
  }
  async findByPaymentReference(reference: string): Promise<DealCampaign | null> {
    return this.legacy(
      await this.prisma.dealCampaign.findFirst({
        where: { paymentReference: reference, deletedAt: null },
        include: this.include,
      }),
    );
  }
  async findBySellerWithPagination(sellerId: string, query: DealCampaignQueryDto) {
    return this.findPaged(
      {
        sellerId,
        deletedAt: null,
        ...(query.status ? { status: query.status } : {}),
        ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
      },
      query,
    );
  }
  async findAllWithPagination(query: DealCampaignQueryDto) {
    return this.findPaged(
      {
        deletedAt: null,
        ...(query.status ? { status: query.status } : {}),
        ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
        ...(query.sellerId ? { sellerId: query.sellerId } : {}),
      },
      query,
    );
  }
  private async findPaged(where: any, query: DealCampaignQueryDto) {
    const [rows, totalItems] = await Promise.all([
      this.prisma.dealCampaign.findMany({
        where,
        include: this.include,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.dealCampaign.count({ where }),
    ]);
    return { items: rows.map((row) => this.legacy(row)!), totalItems };
  }
  async update(id: string, data: Partial<DealCampaign>): Promise<DealCampaign | null> {
    const mapped: any = { ...(data as any) };
    for (const [oldKey, newKey] of [
      ['seller', 'sellerId'],
      ['approvedBy', 'approvedById'],
    ]) {
      if (oldKey in mapped) {
        mapped[newKey] = mapped[oldKey] == null ? null : String(mapped[oldKey]);
        delete mapped[oldKey];
      }
    }
    if (mapped.selectedProductIds)
      mapped.selectedProductIds = mapped.selectedProductIds.map(String);
    try {
      return this.legacy(
        await this.prisma.dealCampaign.update({
          where: { id },
          data: mapped,
          include: this.include,
        }),
      );
    } catch {
      return null;
    }
  }
}
