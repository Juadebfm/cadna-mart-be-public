import { Injectable } from '@nestjs/common';
import { Banner as PrismaBanner } from '../generated/prisma/client';
import { PrismaService } from '@database/prisma.service';
import { BannerType } from './schemas/banner.schema';

export type BannerRecord = PrismaBanner & { _id: string };

@Injectable()
export class BannersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByType(type: BannerType, location?: string): Promise<BannerRecord[]> {
    const now = new Date();
    const activeFilter = {
      type,
      isActive: true,
      deletedAt: null,
      OR: [
        { startAt: null },
        {
          startAt: { lte: now },
          OR: [{ endAt: null }, { endAt: { gte: now } }],
        },
      ],
    };

    const mapId = (banner: PrismaBanner): BannerRecord => ({ ...banner, _id: banner.id });
    if (!location) {
      const rows = await this.prisma.banner.findMany({
        where: activeFilter,
        orderBy: { order: 'asc' },
      });
      return rows.map(mapId);
    }

    const [targeted, global] = await Promise.all([
      this.prisma.banner.findMany({
        where: { AND: [activeFilter, { locations: { has: location } }] },
        orderBy: { order: 'asc' },
      }),
      this.prisma.banner.findMany({
        where: { AND: [activeFilter, { locations: { isEmpty: true } }] },
        orderBy: { order: 'asc' },
      }),
    ]);

    if (targeted.length === 0) return global.map(mapId);
    const seen = new Set(targeted.map((banner) => banner.id));
    return [...targeted.map(mapId), ...global.filter((banner) => !seen.has(banner.id)).map(mapId)];
  }
}
