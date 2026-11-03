import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { createPublicId } from '@database/id.util';
import { Prisma } from '../generated/prisma/client';
import {
  CreateDeliveryRateDto,
  CreateDeliveryZoneDto,
  UpdateDeliveryRateDto,
  UpdateDeliveryZoneDto,
} from './dto/delivery-config.dto';

@Injectable()
export class DeliveryConfigService {
  constructor(private readonly prisma: PrismaService) {}

  private normalize(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
  }

  private normalizeLgas(values: string[]): string[] {
    const lgas = values.map((value) => value.trim().replace(/\s+/g, ' '));
    if (lgas.some((value) => !value)) throw new BadRequestException('LGA names cannot be blank');
    if (new Set(lgas.map((value) => this.normalize(value))).size !== lgas.length) {
      throw new BadRequestException('An LGA can appear only once in a delivery zone');
    }
    return lgas;
  }

  private async lock(tx: Prisma.TransactionClient, key: string): Promise<void> {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }

  private async assertZoneHasNoOverlap(
    tx: Prisma.TransactionClient,
    state: string,
    lgaNames: string[],
    excludeId?: string,
  ) {
    const otherZones = await tx.deliveryZone.findMany({
      where: {
        state: { equals: state.trim(), mode: 'insensitive' },
        isActive: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { name: true, lgaNames: true },
    });
    const requested = new Set(lgaNames.map((lga) => this.normalize(lga)));
    const overlaps = otherZones.flatMap((zone) =>
      zone.lgaNames
        .filter((lga) => requested.has(this.normalize(lga)))
        .map((lga) => `${zone.name}: ${lga}`),
    );
    if (overlaps.length) {
      throw new ConflictException(
        `These LGAs already belong to an active delivery zone: ${overlaps.join(', ')}`,
      );
    }
  }

  async listZones() {
    return this.prisma.deliveryZone.findMany({
      include: { rates: { orderBy: [{ method: 'asc' }, { minWeightGrams: 'asc' }] } },
      orderBy: [{ state: 'asc' }, { name: 'asc' }],
    });
  }

  async createZone(dto: CreateDeliveryZoneDto) {
    const state = dto.state.trim().replace(/\s+/g, ' ');
    const name = dto.name.trim().replace(/\s+/g, ' ');
    const lgaNames = this.normalizeLgas(dto.lgaNames);
    if (!name || !state) throw new BadRequestException('Zone name and state cannot be blank');
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, `delivery-zone-state:${this.normalize(state)}`);
      if (dto.isActive !== false) await this.assertZoneHasNoOverlap(tx, state, lgaNames);
      const duplicate = await tx.deliveryZone.findFirst({
        where: {
          state: { equals: state, mode: 'insensitive' },
          name: { equals: name, mode: 'insensitive' },
        },
      });
      if (duplicate)
        throw new ConflictException('A delivery zone with this name already exists in the state');
      return tx.deliveryZone.create({
        data: { id: createPublicId(), name, state, lgaNames, isActive: dto.isActive ?? true },
        include: { rates: true },
      });
    });
  }

  async updateZone(id: string, dto: UpdateDeliveryZoneDto) {
    const current = await this.prisma.deliveryZone.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Delivery zone not found');
    const state = (dto.state ?? current.state).trim().replace(/\s+/g, ' ');
    const name = (dto.name ?? current.name).trim().replace(/\s+/g, ' ');
    const lgaNames = dto.lgaNames ? this.normalizeLgas(dto.lgaNames) : current.lgaNames;
    const isActive = dto.isActive ?? current.isActive;
    if (!name || !state) throw new BadRequestException('Zone name and state cannot be blank');
    return this.prisma.$transaction(async (tx) => {
      const stateKeys = [
        ...new Set([current.state, state].map((value) => this.normalize(value))),
      ].sort();
      for (const stateKey of stateKeys) await this.lock(tx, `delivery-zone-state:${stateKey}`);
      if (isActive) await this.assertZoneHasNoOverlap(tx, state, lgaNames, id);
      const duplicate = await tx.deliveryZone.findFirst({
        where: {
          id: { not: id },
          state: { equals: state, mode: 'insensitive' },
          name: { equals: name, mode: 'insensitive' },
        },
      });
      if (duplicate)
        throw new ConflictException('A delivery zone with this name already exists in the state');
      return tx.deliveryZone.update({
        where: { id },
        data: { state, name, lgaNames, isActive },
        include: { rates: true },
      });
    });
  }

  private async assertRateHasNoOverlap(
    tx: Prisma.TransactionClient,
    zoneId: string,
    method: string,
    minWeightGrams: number,
    maxWeightGrams: number | null,
    excludeId?: string,
  ) {
    if (maxWeightGrams !== null && maxWeightGrams < minWeightGrams) {
      throw new BadRequestException('Maximum weight must be at least the minimum weight');
    }
    const existingRates = await tx.deliveryRate.findMany({
      where: {
        deliveryZoneId: zoneId,
        method,
        isActive: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { minWeightGrams: true, maxWeightGrams: true },
    });
    const overlaps = existingRates.some((rate) => {
      const existingMax = rate.maxWeightGrams ?? Number.POSITIVE_INFINITY;
      const newMax = maxWeightGrams ?? Number.POSITIVE_INFINITY;
      return minWeightGrams <= existingMax && rate.minWeightGrams <= newMax;
    });
    if (overlaps)
      throw new ConflictException('This weight range overlaps another active delivery rate');
  }

  async createRate(zoneId: string, dto: CreateDeliveryRateDto) {
    const zone = await this.prisma.deliveryZone.findFirst({
      where: { id: zoneId, isActive: true },
    });
    if (!zone) throw new NotFoundException('Active delivery zone not found');
    const maxWeightGrams = dto.maxWeightGrams ?? null;
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, `delivery-rate:${zoneId}:${dto.method}`);
      if (dto.isActive !== false) {
        await this.assertRateHasNoOverlap(
          tx,
          zoneId,
          dto.method,
          dto.minWeightGrams,
          maxWeightGrams,
        );
      }
      return tx.deliveryRate.create({
        data: {
          id: createPublicId(),
          deliveryZoneId: zoneId,
          method: dto.method,
          minWeightGrams: dto.minWeightGrams,
          maxWeightGrams,
          amountKobo: dto.amountKobo,
          isActive: dto.isActive ?? true,
        },
      });
    });
  }

  async updateRate(id: string, dto: UpdateDeliveryRateDto) {
    const current = await this.prisma.deliveryRate.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Delivery rate not found');
    const method = dto.method ?? current.method;
    const minWeightGrams = dto.minWeightGrams ?? current.minWeightGrams;
    const maxWeightGrams =
      dto.maxWeightGrams === undefined ? current.maxWeightGrams : dto.maxWeightGrams;
    const isActive = dto.isActive ?? current.isActive;
    return this.prisma.$transaction(async (tx) => {
      const rateKeys = [...new Set([current.method, method])].sort();
      for (const rateKey of rateKeys) {
        await this.lock(tx, `delivery-rate:${current.deliveryZoneId}:${rateKey}`);
      }
      if (isActive) {
        await this.assertRateHasNoOverlap(
          tx,
          current.deliveryZoneId,
          method,
          minWeightGrams,
          maxWeightGrams,
          id,
        );
      }
      return tx.deliveryRate.update({
        where: { id },
        data: {
          method,
          minWeightGrams,
          maxWeightGrams,
          amountKobo: dto.amountKobo ?? current.amountKobo,
          isActive,
        },
      });
    });
  }
}
