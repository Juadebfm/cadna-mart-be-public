import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '@database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import {
  CreatePricingRuleDto,
  UpdatePricingRuleDto,
  UpdateFeesDto,
  SimulateDto,
} from './dto/pricing-rule.dto';

interface FeeConfig {
  vatPercent: number;
  standardDeliveryFee: number;
  expressDeliveryFee: number;
  platformFeePercent: number;
}

@Injectable()
export class AdminPricingService {
  private readonly DEFAULT_VAT = 7.5;
  private readonly DEFAULT_STANDARD_DELIVERY = 1500;
  private readonly DEFAULT_EXPRESS_DELIVERY = 3000;
  private readonly DEFAULT_PLATFORM_FEE = 0;

  constructor(private readonly prisma: PrismaService) {}

  private async getFeeConfig(): Promise<FeeConfig> {
    const doc = await this.prisma.siteConfig.findUnique({ where: { key: 'fees' } });
    const stored = (doc?.value ?? {}) as Partial<FeeConfig>;

    return {
      vatPercent: stored.vatPercent ?? this.DEFAULT_VAT,
      standardDeliveryFee: stored.standardDeliveryFee ?? this.DEFAULT_STANDARD_DELIVERY,
      expressDeliveryFee: stored.expressDeliveryFee ?? this.DEFAULT_EXPRESS_DELIVERY,
      platformFeePercent: stored.platformFeePercent ?? this.DEFAULT_PLATFORM_FEE,
    };
  }

  async listRules() {
    return this.prisma.pricingRule.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createRule(dto: CreatePricingRuleDto) {
    return this.prisma.pricingRule.create({
      data: {
        id: randomBytes(12).toString('hex'),
        name: dto.name,
        type: dto.type,
        scope: dto.scope,
        scopeValue: dto.scopeValue ?? null,
        value: dto.value,
        valueType: dto.valueType,
        description: dto.description ?? null,
      },
    });
  }

  async updateRule(id: string, dto: UpdatePricingRuleDto) {
    const rule = await this.prisma.pricingRule.findFirst({ where: { id, deletedAt: null } });

    if (!rule) {
      throw new NotFoundException(`Pricing rule ${id} not found`);
    }

    return this.prisma.pricingRule.update({ where: { id }, data: dto });
  }

  async getFees(): Promise<object> {
    const config = await this.getFeeConfig();
    return {
      ...config,
      vatRate: config.vatPercent / 100,
      currency: 'NGN',
    };
  }

  async updateFees(dto: UpdateFeesDto): Promise<object> {
    const existing = await this.prisma.siteConfig.findUnique({ where: { key: 'fees' } });
    const current = (existing?.value ?? {}) as Record<string, unknown>;

    const merged: Record<string, unknown> = { ...current };
    if (dto.vatPercent !== undefined) merged.vatPercent = dto.vatPercent;
    if (dto.standardDeliveryFee !== undefined) merged.standardDeliveryFee = dto.standardDeliveryFee;
    if (dto.expressDeliveryFee !== undefined) merged.expressDeliveryFee = dto.expressDeliveryFee;
    if (dto.platformFeePercent !== undefined) merged.platformFeePercent = dto.platformFeePercent;

    await this.prisma.siteConfig.upsert({
      where: { key: 'fees' },
      create: {
        id: randomBytes(12).toString('hex'),
        key: 'fees',
        value: merged as Prisma.InputJsonValue,
      },
      update: { value: merged as Prisma.InputJsonValue },
    });

    return this.getFees();
  }

  async simulate(dto: SimulateDto): Promise<object> {
    const config = await this.getFeeConfig();
    const subtotal = dto.cartSubtotal;
    const deliveryMode = dto.deliveryMode ?? 'standard';

    const deliveryFee =
      deliveryMode === 'express'
        ? config.expressDeliveryFee
        : deliveryMode === 'pickup'
          ? 0
          : config.standardDeliveryFee;

    const tax = subtotal * (config.vatPercent / 100);
    const platformFee = subtotal * (config.platformFeePercent / 100);
    const total = subtotal + deliveryFee + tax + platformFee;

    const fmt = (n: number) => ({
      amount: Math.round(n),
      currency: 'NGN',
      formatted: '₦' + Math.round(n).toLocaleString('en-NG'),
    });

    return {
      subtotal: fmt(subtotal),
      deliveryFee: fmt(deliveryFee),
      tax: fmt(tax),
      platformFee: fmt(platformFee),
      total: fmt(total),
      deliveryMode,
      config: {
        vatPercent: config.vatPercent,
        platformFeePercent: config.platformFeePercent,
      },
    };
  }
}
