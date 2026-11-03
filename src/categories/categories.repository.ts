import { Injectable } from '@nestjs/common';
import { Prisma, Category as PrismaCategory } from '../generated/prisma/client';
import { PrismaService } from '@database/prisma.service';
import { createPublicId } from '@database/id.util';

export type CategoryRecord = PrismaCategory;

export interface CategoryWriteData {
  name?: string;
  slug?: string;
  iconUrl?: string | null;
  parent?: string | null;
  order?: number;
  isActive?: boolean;
  productCount?: number;
  deletedAt?: Date | null;
}

@Injectable()
export class CategoriesRepository {
  constructor(public readonly prisma: PrismaService) {}

  async findAll(includeCounts: boolean): Promise<CategoryRecord[]> {
    const rows = await this.prisma.category.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      ...(includeCounts ? {} : { omit: { productCount: true } }),
    });
    return rows as CategoryRecord[];
  }

  findBySlug(slug: string): Promise<CategoryRecord | null> {
    return this.prisma.category.findFirst({ where: { slug, deletedAt: null } });
  }

  findById(id: string): Promise<CategoryRecord | null> {
    return this.prisma.category.findFirst({ where: { id, deletedAt: null } });
  }

  create(data: CategoryWriteData): Promise<CategoryRecord> {
    const { parent, ...fields } = data;
    const createData: Prisma.CategoryUncheckedCreateInput = {
      id: createPublicId(),
      name: fields.name?.trim() ?? '',
      slug: fields.slug?.trim().toLowerCase() ?? '',
      iconUrl: fields.iconUrl ?? null,
      parentId: parent ?? null,
      order: fields.order ?? 0,
      isActive: fields.isActive ?? true,
      productCount: fields.productCount ?? 0,
      deletedAt: fields.deletedAt ?? null,
    };
    return this.prisma.category.create({ data: createData });
  }

  update(id: string, data: CategoryWriteData): Promise<CategoryRecord> {
    const { parent, slug, name, ...fields } = data;
    const updateData: Prisma.CategoryUncheckedUpdateInput = {
      ...fields,
      ...(parent !== undefined ? { parentId: parent } : {}),
      ...(slug !== undefined ? { slug: slug.trim().toLowerCase() } : {}),
      ...(name !== undefined ? { name: name.trim() } : {}),
    };
    return this.prisma.category.update({ where: { id }, data: updateData });
  }

  async incrementProductCount(categoryId: string, amount: number): Promise<void> {
    await this.prisma.category.update({
      where: { id: categoryId },
      data: { productCount: { increment: amount } },
    });
  }
}
