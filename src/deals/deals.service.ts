import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@config/config.service';
import { LoggerService } from '@logger/logger.service';
import { DealCampaignQueryDto } from './dto/deal-campaign-query.dto';
import { CreateDealCampaignDto } from './dto/create-deal-campaign.dto';
import { UpdateDealCampaignDto } from './dto/update-deal-campaign.dto';
import { AdminUpdateDealCampaignDto } from './dto/admin-update-deal-campaign.dto';
import { DealsRepository } from './deals.repository';
import {
  DealCampaign,
  DealCampaignStatus,
  DealPaymentStatus,
} from './schemas/deal-campaign.schema';

interface Actor {
  userId: string;
  accountType: string;
}

interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data?: {
    authorization_url?: string;
    access_code?: string;
    reference?: string;
  };
}

@Injectable()
export class DealsService {
  constructor(
    private readonly dealsRepository: DealsRepository,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async createMyCampaign(dto: CreateDealCampaignDto, actor: Actor) {
    const seller = await this.findSellerByOwner(actor.userId);
    const selectedProductIds = await this.validateSellerProducts(dto.selectedProductIds, seller.id);
    const schedule = this.resolveSchedule(dto.startsAt, dto.endsAt);
    const feeAmount = this.computeFeeAmount(selectedProductIds.length);

    const created = await this.dealsRepository.create({
      title: dto.title.trim(),
      seller: seller.id as any,
      selectedProductIds: selectedProductIds as any,
      maxProducts: this.configService.deals.maxProducts,
      feeAmount,
      currency: 'NGN',
      status: DealCampaignStatus.DRAFT,
      paymentStatus: DealPaymentStatus.UNPAID,
      startsAt: schedule.startsAt,
      endsAt: schedule.endsAt,
      isActive: true,
      deletedAt: null,
    } as any);

    const campaign = await this.dealsRepository.findById(
      (created as unknown as { _id: { toString(): string } })._id.toString(),
    );
    return this.toDto(campaign as DealCampaign);
  }

  async listMyCampaigns(actor: Actor, query: DealCampaignQueryDto) {
    const seller = await this.findSellerByOwner(actor.userId);
    const { items, totalItems } = await this.dealsRepository.findBySellerWithPagination(
      seller.id,
      query,
    );
    const totalPages = Math.ceil(totalItems / query.limit);

    return {
      items: items.map((item) => this.toDto(item)),
      pagination: {
        page: query.page,
        limit: query.limit,
        totalItems,
        totalPages,
        hasNextPage: query.page < totalPages,
        hasPrevPage: query.page > 1,
      },
    };
  }

  async getMyCampaign(id: string, actor: Actor) {
    const seller = await this.findSellerByOwner(actor.userId);
    const campaign = await this.dealsRepository.findByIdForSeller(id, seller.id);
    if (!campaign) throw new NotFoundException('Deal campaign not found');
    return this.toDto(campaign);
  }

  async updateMyCampaign(id: string, dto: UpdateDealCampaignDto, actor: Actor) {
    const seller = await this.findSellerByOwner(actor.userId);
    const campaign = await this.dealsRepository.findByIdForSeller(id, seller.id);
    if (!campaign) throw new NotFoundException('Deal campaign not found');

    if (
      campaign.paymentStatus === DealPaymentStatus.PAID ||
      [DealCampaignStatus.LIVE, DealCampaignStatus.EXPIRED, DealCampaignStatus.CANCELLED].includes(
        campaign.status,
      )
    ) {
      throw new BadRequestException('Campaign can no longer be edited');
    }

    const updates: Record<string, unknown> = {};
    if (dto.title !== undefined) updates.title = dto.title.trim();

    const nextSchedule = this.resolveSchedule(
      dto.startsAt ?? campaign.startsAt?.toISOString(),
      dto.endsAt ?? campaign.endsAt?.toISOString(),
    );
    updates.startsAt = nextSchedule.startsAt;
    updates.endsAt = nextSchedule.endsAt;

    let selectedProductIds = campaign.selectedProductIds.map((value) => value.toString());
    if (dto.selectedProductIds !== undefined) {
      selectedProductIds = await this.validateSellerProducts(dto.selectedProductIds, seller.id);
      updates.selectedProductIds = selectedProductIds;
    }

    updates.feeAmount = this.computeFeeAmount(selectedProductIds.length);
    updates.paymentStatus = DealPaymentStatus.UNPAID;
    updates.status = DealCampaignStatus.DRAFT;
    updates.paymentReference = null;
    updates.paymentAuthorizationUrl = null;
    updates.paymentAccessCode = null;
    updates.paidAt = null;

    const updated = await this.dealsRepository.update(id, updates as any);
    if (!updated) throw new NotFoundException('Deal campaign not found');
    return this.toDto(updated);
  }

  async removeMyCampaign(id: string, actor: Actor): Promise<void> {
    const seller = await this.findSellerByOwner(actor.userId);
    const campaign = await this.dealsRepository.findByIdForSeller(id, seller.id);
    if (!campaign) throw new NotFoundException('Deal campaign not found');

    await this.dealsRepository.update(id, {
      status: DealCampaignStatus.CANCELLED,
      isActive: false,
      deletedAt: new Date(),
    } as any);

    await this.syncDealsSectionForProducts(
      campaign.selectedProductIds.map((value) => value.toString()),
    );
  }

  async initializePayment(id: string, actor: Actor) {
    const seller = await this.findSellerByOwner(actor.userId);
    const campaign = await this.dealsRepository.findByIdForSeller(id, seller.id);
    if (!campaign) throw new NotFoundException('Deal campaign not found');

    if (campaign.paymentStatus === DealPaymentStatus.PAID) {
      throw new BadRequestException('Campaign payment is already completed');
    }
    if ([DealCampaignStatus.CANCELLED, DealCampaignStatus.EXPIRED].includes(campaign.status)) {
      throw new BadRequestException('Campaign is not eligible for payment');
    }
    if (campaign.selectedProductIds.length === 0) {
      throw new BadRequestException('Campaign must include at least one product');
    }

    const sellerOwner = (campaign.seller as unknown as { owner?: { toString(): string } }).owner;
    const ownerId = sellerOwner?.toString() ?? actor.userId;
    const owner = await this.dealsRepository.prisma.user.findFirst({
      where: { id: ownerId, deletedAt: null },
      select: { email: true },
    });
    if (!owner?.email) throw new BadRequestException('Seller owner email is unavailable');

    const paystackSecretKey = this.configService.paystack.secretKey;
    if (!paystackSecretKey) {
      throw new InternalServerErrorException('PAYSTACK_SECRET_KEY is not configured');
    }

    const reference = `deal_${id}_${Date.now().toString(36)}`;
    const amount = Math.round(campaign.feeAmount * 100);
    const payload = {
      email: owner.email,
      amount,
      reference,
      callback_url: this.configService.paystack.callbackUrl || undefined,
      metadata: {
        source: 'deal_campaign',
        campaignId: id,
        sellerId: seller.id,
      },
    };

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const result = (await response.json()) as PaystackInitializeResponse;

    if (
      !response.ok ||
      !result.status ||
      !result.data?.authorization_url ||
      !result.data.reference
    ) {
      this.logger.error(
        `Paystack initialize failed for campaign ${id}: ${JSON.stringify(result)}`,
        undefined,
        'DealsService',
      );
      throw new BadGatewayException('Failed to initialize Paystack payment');
    }

    const nextStatus = DealCampaignStatus.PENDING_PAYMENT;
    await this.dealsRepository.update(id, {
      status: nextStatus,
      paymentStatus: DealPaymentStatus.PENDING,
      paymentReference: result.data.reference,
      paymentAuthorizationUrl: result.data.authorization_url ?? null,
      paymentAccessCode: result.data.access_code ?? null,
    } as any);

    return {
      campaignId: id,
      reference: result.data.reference,
      authorizationUrl: result.data.authorization_url,
      accessCode: result.data.access_code ?? null,
      amount: campaign.feeAmount,
      currency: campaign.currency,
      status: nextStatus,
    };
  }

  async listAllCampaigns(query: DealCampaignQueryDto) {
    const { items, totalItems } = await this.dealsRepository.findAllWithPagination(query);
    const totalPages = Math.ceil(totalItems / query.limit);
    return {
      items: items.map((item) => this.toDto(item)),
      pagination: {
        page: query.page,
        limit: query.limit,
        totalItems,
        totalPages,
        hasNextPage: query.page < totalPages,
        hasPrevPage: query.page > 1,
      },
    };
  }

  async getCampaignById(id: string) {
    const campaign = await this.dealsRepository.findById(id);
    if (!campaign) throw new NotFoundException('Deal campaign not found');
    return this.toDto(campaign);
  }

  async updateCampaignByAdmin(id: string, dto: AdminUpdateDealCampaignDto) {
    const campaign = await this.dealsRepository.findById(id);
    if (!campaign) throw new NotFoundException('Deal campaign not found');

    const updates: Record<string, unknown> = {};
    if (dto.title !== undefined) updates.title = dto.title.trim();
    if (dto.feeAmount !== undefined) updates.feeAmount = dto.feeAmount;
    if (dto.paymentStatus !== undefined) updates.paymentStatus = dto.paymentStatus;
    if (dto.paidAt !== undefined) updates.paidAt = dto.paidAt ? new Date(dto.paidAt) : null;

    const currentStartsAt = dto.startsAt ?? campaign.startsAt?.toISOString();
    const currentEndsAt = dto.endsAt ?? campaign.endsAt?.toISOString();
    if (dto.startsAt !== undefined || dto.endsAt !== undefined) {
      const schedule = this.resolveSchedule(currentStartsAt, currentEndsAt);
      updates.startsAt = schedule.startsAt;
      updates.endsAt = schedule.endsAt;
    }

    if (dto.selectedProductIds !== undefined) {
      const sellerId = (
        campaign.seller as unknown as { _id: { toString(): string } }
      )._id.toString();
      const validated = await this.validateSellerProducts(dto.selectedProductIds, sellerId);
      updates.selectedProductIds = validated;
    }

    const previousStatus = campaign.status;
    if (dto.status !== undefined) {
      const nextPaymentStatus = dto.paymentStatus ?? campaign.paymentStatus;
      updates.status = dto.status;
      if (dto.status === DealCampaignStatus.LIVE && nextPaymentStatus !== DealPaymentStatus.PAID) {
        throw new BadRequestException('Cannot set campaign to live before payment is completed');
      }
      if ([DealCampaignStatus.CANCELLED, DealCampaignStatus.EXPIRED].includes(dto.status)) {
        updates.isActive = false;
      }
    }

    const updated = await this.dealsRepository.update(id, updates as any);
    if (!updated) throw new NotFoundException('Deal campaign not found');

    const nextStatus = updated.status;
    if (previousStatus !== nextStatus || dto.selectedProductIds !== undefined) {
      const previousIds = campaign.selectedProductIds.map((value) => value.toString());
      const nextIds = updated.selectedProductIds.map((value) => value.toString());
      await this.syncDealsSectionForProducts([...previousIds, ...nextIds]);
    }

    return this.toDto(updated);
  }

  async approveCampaign(id: string, actor: Actor) {
    const campaign = await this.dealsRepository.findById(id);
    if (!campaign) throw new NotFoundException('Deal campaign not found');

    const now = new Date();
    const nextStatus =
      campaign.paymentStatus === DealPaymentStatus.PAID
        ? this.resolvePostPaymentStatus(campaign.startsAt, campaign.endsAt, now)
        : DealCampaignStatus.PENDING_PAYMENT;

    const updated = await this.dealsRepository.update(id, {
      approvedBy: actor.userId,
      approvedAt: now,
      status: nextStatus,
    } as any);
    if (!updated) throw new NotFoundException('Deal campaign not found');

    if (nextStatus === DealCampaignStatus.LIVE) {
      await this.syncDealsSectionForProducts(
        updated.selectedProductIds.map((value) => value.toString()),
      );
    }

    return this.toDto(updated);
  }

  async removeCampaignByAdmin(id: string): Promise<void> {
    const campaign = await this.dealsRepository.findById(id);
    if (!campaign) throw new NotFoundException('Deal campaign not found');

    await this.dealsRepository.update(id, {
      status: DealCampaignStatus.CANCELLED,
      isActive: false,
      deletedAt: new Date(),
    } as any);
    await this.syncDealsSectionForProducts(
      campaign.selectedProductIds.map((value) => value.toString()),
    );
  }

  async handlePaystackEvent(eventPayload: unknown): Promise<void> {
    const event = eventPayload as { event?: string; data?: Record<string, unknown> };
    const type = event.event ?? '';
    const data = event.data ?? {};
    const reference = typeof data.reference === 'string' ? data.reference : '';
    if (!reference) {
      this.logger.warn('Paystack webhook received without reference', 'DealsService');
      return;
    }

    const campaign = await this.dealsRepository.findByPaymentReference(reference);
    if (!campaign) {
      this.logger.warn(`No deal campaign matches reference ${reference}`, 'DealsService');
      return;
    }

    if (type === 'charge.success') {
      await this.handlePaystackChargeSuccess(campaign, data);
      return;
    }

    if (type === 'charge.failed') {
      await this.dealsRepository.update(
        (campaign as unknown as { _id: { toString(): string } })._id.toString(),
        {
          paymentStatus: DealPaymentStatus.FAILED,
          status: DealCampaignStatus.DRAFT,
        } as any,
      );
      this.logger.warn(`Paystack charge.failed for campaign ${campaign._id}`, 'DealsService');
      return;
    }

    this.logger.debug(`Unhandled Paystack event ${type}`, 'DealsService');
  }

  private async handlePaystackChargeSuccess(
    campaign: DealCampaign,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (campaign.paymentStatus === DealPaymentStatus.PAID) {
      return;
    }

    const now = new Date();
    const nextStatus = this.resolvePostPaymentStatus(campaign.startsAt, campaign.endsAt, now);
    const amountInKobo = typeof payload.amount === 'number' ? payload.amount : undefined;
    const paidAmount =
      amountInKobo !== undefined ? Math.round(amountInKobo / 100) : campaign.feeAmount;
    const id = (campaign as unknown as { _id: { toString(): string } })._id.toString();

    const updated = await this.dealsRepository.update(id, {
      paymentStatus: DealPaymentStatus.PAID,
      status: nextStatus,
      paidAt: now,
      feeAmount: paidAmount,
    } as any);

    if (!updated) return;

    if (nextStatus === DealCampaignStatus.LIVE) {
      await this.syncDealsSectionForProducts(
        updated.selectedProductIds.map((value) => value.toString()),
      );
    }

    this.logger.log(
      `Paystack payment confirmed for campaign ${id}; status=${nextStatus}`,
      'DealsService',
    );
  }

  private resolvePostPaymentStatus(
    startsAt: Date | null,
    endsAt: Date | null,
    now: Date,
  ): DealCampaignStatus {
    if (endsAt && endsAt <= now) {
      return DealCampaignStatus.EXPIRED;
    }
    if (startsAt && startsAt > now) {
      return DealCampaignStatus.SCHEDULED;
    }
    return DealCampaignStatus.LIVE;
  }

  private resolveSchedule(startsAt?: string | null, endsAt?: string | null) {
    const startDate = startsAt ? new Date(startsAt) : null;
    const endDate = endsAt ? new Date(endsAt) : null;
    if (startDate && Number.isNaN(startDate.getTime())) {
      throw new BadRequestException('startsAt must be a valid ISO date');
    }
    if (endDate && Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('endsAt must be a valid ISO date');
    }
    if (startDate && endDate && endDate <= startDate) {
      throw new BadRequestException('endsAt must be later than startsAt');
    }

    return { startsAt: startDate, endsAt: endDate };
  }

  private computeFeeAmount(productCount: number): number {
    return productCount * this.configService.deals.feePerProduct;
  }

  private async findSellerByOwner(
    userId: string,
  ): Promise<{ id: string; name: string; slug: string }> {
    const seller = await this.dealsRepository.prisma.seller.findFirst({
      where: { ownerId: userId, deletedAt: null, isActive: true },
      select: { id: true, name: true, slug: true },
    });
    if (!seller?.id) {
      throw new ForbiddenException('You do not have an active seller profile');
    }
    return {
      id: seller.id,
      name: seller.name,
      slug: seller.slug,
    };
  }

  private async validateSellerProducts(productIds: string[], sellerId: string): Promise<string[]> {
    const unique = [...new Set(productIds.map((id) => id.trim()))];
    const maxProducts = this.configService.deals.maxProducts;

    if (unique.length === 0) {
      throw new BadRequestException('At least one product must be selected');
    }
    if (unique.length > maxProducts) {
      throw new BadRequestException(`A campaign can contain at most ${maxProducts} products`);
    }

    const products = await this.dealsRepository.prisma.product.findMany({
      where: {
        id: { in: unique },
        sellerId,
        deletedAt: null,
        isActive: true,
        publicationStatus: 'live',
        isDeactivated: false,
        moderationStatus: 'approved',
        seller: {
          is: {
            isActive: true,
            deletedAt: null,
            owner: {
              is: {
                sellerProfile: {
                  is: {
                    deletedAt: null,
                    applicationStatus: 'approved',
                    isApproved: true,
                    kycStatus: 'verified',
                  },
                },
              },
            },
          },
        },
      },
      select: { id: true },
    });
    if (products.length !== unique.length) {
      throw new BadRequestException(
        'All selected products must exist, be active, and belong to the seller',
      );
    }

    return unique;
  }

  private async syncDealsSectionForProducts(productIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(productIds)].filter(Boolean);
    if (uniqueIds.length === 0) return;
    const liveCampaigns = await this.dealsRepository.prisma.dealCampaign.findMany({
      where: {
        deletedAt: null,
        status: DealCampaignStatus.LIVE,
        paymentStatus: DealPaymentStatus.PAID,
        selectedProductIds: { hasSome: uniqueIds },
      },
      select: { selectedProductIds: true },
    });

    const liveProductIds = new Set<string>();
    for (const campaign of liveCampaigns) {
      for (const value of campaign.selectedProductIds ?? []) {
        liveProductIds.add(value);
      }
    }

    const toAdd = uniqueIds.filter((id) => liveProductIds.has(id));
    const toRemove = uniqueIds.filter((id) => !liveProductIds.has(id));

    for (const id of toAdd) {
      const product = await this.dealsRepository.prisma.product.findUnique({
        where: { id },
        select: { sections: true },
      });
      if (product && !product.sections.includes('best_deals'))
        await this.dealsRepository.prisma.product.update({
          where: { id },
          data: { sections: [...product.sections, 'best_deals'] },
        });
    }
    for (const id of toRemove) {
      const product = await this.dealsRepository.prisma.product.findUnique({
        where: { id },
        select: { sections: true },
      });
      if (product)
        await this.dealsRepository.prisma.product.update({
          where: { id },
          data: { sections: product.sections.filter((section) => section !== 'best_deals') },
        });
    }
  }

  private toDto(campaign: DealCampaign) {
    const seller = campaign.seller as unknown as {
      _id: { toString(): string };
      name: string;
      slug: string;
      owner?: { toString(): string };
    };

    return {
      id: (campaign as unknown as { _id: { toString(): string } })._id.toString(),
      title: campaign.title,
      status: campaign.status,
      paymentStatus: campaign.paymentStatus,
      feeAmount: campaign.feeAmount,
      currency: campaign.currency,
      maxProducts: campaign.maxProducts,
      selectedProductIds: campaign.selectedProductIds.map((value) => value.toString()),
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      paymentReference: campaign.paymentReference,
      paymentAuthorizationUrl: campaign.paymentAuthorizationUrl,
      paidAt: campaign.paidAt,
      approvedAt: campaign.approvedAt,
      isActive: campaign.isActive,
      seller: seller
        ? {
            id: seller._id.toString(),
            name: seller.name,
            slug: seller.slug,
          }
        : null,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    };
  }
}
