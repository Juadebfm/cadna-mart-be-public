import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';

@Injectable()
export class BrandsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<{ items: Array<{ name: string; productCount: number }> }> {
    const rows = await this.prisma.product.groupBy({
      by: ['brand'],
      where: { deletedAt: null, isActive: true, brand: { not: null } },
      _count: { _all: true },
      orderBy: [{ _count: { brand: 'desc' } }, { brand: 'asc' }],
    });

    return {
      items: rows
        .filter((row) => row.brand?.trim())
        .map((row) => ({ name: row.brand!, productCount: row._count._all })),
    };
  }
}
