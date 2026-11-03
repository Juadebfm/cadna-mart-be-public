import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '@database/prisma.service';
import { createPublicId } from '@database/id.util';
import { Product } from './schemas/product.schema';
import { ProductQueryDto, ProductSortOption } from './dto/product-query.dto';

@Injectable()
export class ProductsRepository {
  constructor(public readonly prisma: PrismaService) {}

  private readonly cardSeller = {
    id: true,
    name: true,
    slug: true,
    logoUrl: true,
    isVerified: true,
    responseRatePercent: true,
    averageRating: true,
    joinedYear: true,
    reviewCount: true,
    followerCount: true,
    location: true,
    deliveryTimeRange: true,
    ownerId: true,
  } as const;

  private legacy(row: any): Product {
    if (!row) return row;
    const seller = row.seller
      ? { ...row.seller, _id: row.seller.id, owner: row.seller.ownerId }
      : row.seller;
    return {
      ...row,
      _id: row.id,
      seller,
      category: row.categoryId,
      subCategory: row.subCategoryId,
    } as unknown as Product;
  }

  private productFilters(
    query: ProductQueryDto,
    options: {
      categoryIds?: string[];
      subCategoryIds?: string[];
      sellerId?: string;
      includeInactive?: boolean;
    } = {},
  ): Prisma.Sql {
    const filters: Prisma.Sql[] = [Prisma.sql`p."deletedAt" IS NULL`];
    if (!options.includeInactive) {
      filters.push(Prisma.sql`p."isActive" = TRUE`);
      filters.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "stores" AS s
        JOIN "seller_profiles" AS sp ON sp."userId" = s."ownerId"
        WHERE s."id" = p."sellerId" AND s."isActive" = TRUE AND s."deletedAt" IS NULL
          AND sp."deletedAt" IS NULL AND sp."applicationStatus" = 'approved'
          AND sp."isApproved" = TRUE AND sp."kycStatus" = 'verified'
      )`);
    }
    if (options.sellerId) filters.push(Prisma.sql`p."sellerId" = ${options.sellerId}`);
    if (query.q) filters.push(Prisma.sql`p."name" ILIKE ${`%${query.q}%`}`);
    if (query.section) filters.push(Prisma.sql`p."sections" @> ARRAY[${query.section}]::text[]`);
    if (options.categoryIds?.length) {
      filters.push(Prisma.sql`p."categoryId" IN (${Prisma.join(options.categoryIds)})`);
    }
    if (options.subCategoryIds?.length) {
      filters.push(Prisma.sql`p."subCategoryId" IN (${Prisma.join(options.subCategoryIds)})`);
    }
    if (query.brand) filters.push(Prisma.sql`p."brand" ILIKE ${`%${query.brand}%`}`);
    if (query.inStock) filters.push(Prisma.sql`p."inventoryStatus" = 'in_stock'`);
    if (query.ratingGte !== undefined) filters.push(Prisma.sql`p."rating" >= ${query.ratingGte}`);
    if (query.minPrice !== undefined) {
      filters.push(
        Prisma.sql`COALESCE(NULLIF(p."price"->>'amount', '')::numeric, 0) >= ${query.minPrice}`,
      );
    }
    if (query.maxPrice !== undefined) {
      filters.push(
        Prisma.sql`COALESCE(NULLIF(p."price"->>'amount', '')::numeric, 0) <= ${query.maxPrice}`,
      );
    }
    return Prisma.join(filters, ' AND ');
  }

  private productOrder(sort: ProductSortOption): Prisma.Sql {
    if (sort === ProductSortOption.PRICE_ASC) {
      return Prisma.sql`COALESCE(NULLIF(p."price"->>'amount', '')::numeric, 0) ASC, p."id" ASC`;
    }
    if (sort === ProductSortOption.PRICE_DESC) {
      return Prisma.sql`COALESCE(NULLIF(p."price"->>'amount', '')::numeric, 0) DESC, p."id" ASC`;
    }
    if (sort === ProductSortOption.NEWEST) {
      return Prisma.sql`p."createdAt" DESC, p."id" ASC`;
    }
    return Prisma.sql`p."salesCount" DESC, p."createdAt" DESC, p."id" ASC`;
  }

  private async findProductPage(filters: Prisma.Sql, query: ProductQueryDto) {
    const [ids, counts] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT p."id"
        FROM "products" AS p
        WHERE ${filters}
        ORDER BY ${this.productOrder(query.sort)}
        OFFSET ${(query.page - 1) * query.limit}
        LIMIT ${query.limit}
      `),
      this.prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM "products" AS p
        WHERE ${filters}
      `),
    ]);
    if (!ids.length) return { items: [], totalItems: counts[0]?.count ?? 0 };

    const rows = await this.prisma.product.findMany({
      where: { id: { in: ids.map(({ id }) => id) } },
      include: { seller: { select: this.cardSeller } },
    });
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    return {
      items: ids.flatMap(({ id }) => {
        const row = rowsById.get(id);
        return row ? [this.legacy(row)] : [];
      }),
      totalItems: counts[0]?.count ?? 0,
    };
  }

  async findWithPagination(
    query: ProductQueryDto,
    categoryIds?: string[],
    subCategoryIds?: string[],
  ) {
    return this.findProductPage(this.productFilters(query, { categoryIds, subCategoryIds }), query);
  }

  async findBySlug(slug: string): Promise<Product | null> {
    const row = await this.prisma.product.findFirst({
      where: {
        slug,
        deletedAt: null,
        isActive: true,
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
      include: { seller: { select: this.cardSeller } },
    });
    return this.legacy(row);
  }

  async findById(id: string): Promise<Product | null> {
    const row = await this.prisma.product.findFirst({
      where: {
        id,
        deletedAt: null,
        isActive: true,
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
      include: { seller: { select: this.cardSeller } },
    });
    return this.legacy(row);
  }

  async findByIdWithSeller(id: string): Promise<Product | null> {
    const row = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { seller: { select: this.cardSeller } },
    });
    return this.legacy(row);
  }

  async findBySection(section: string, limit: number): Promise<Product[]> {
    const rows = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        sections: { has: section },
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
      orderBy: [{ salesCount: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      include: { seller: { select: this.cardSeller } },
    });
    return rows.map((row) => this.legacy(row));
  }

  async findRelated(productId: string, limit: number): Promise<Product[]> {
    const row = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { categoryId: true, brand: true },
    });
    if (!row) return [];
    const rows = await this.prisma.product.findMany({
      where: {
        id: { not: productId },
        deletedAt: null,
        isActive: true,
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
        OR: [{ categoryId: row.categoryId ?? undefined }, { brand: row.brand ?? undefined }],
      },
      orderBy: { salesCount: 'desc' },
      take: limit,
      include: { seller: { select: this.cardSeller } },
    });
    return rows.map((item) => this.legacy(item));
  }

  async searchSuggest(q: string, limit: number): Promise<Product[]> {
    const rows = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        name: { contains: q, mode: 'insensitive' },
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
      take: limit,
    });
    return rows.map((row) => this.legacy(row));
  }

  async create(data: Partial<Product>): Promise<Product> {
    const value = data as any;
    const row = await this.prisma.product.create({
      data: {
        id: createPublicId(),
        name: value.name,
        slug: value.slug,
        sku: value.sku ?? null,
        brand: value.brand ?? null,
        thumbnailUrl: value.thumbnailUrl ?? null,
        price: value.price,
        originalPrice: value.originalPrice ?? undefined,
        discountPercent: value.discountPercent ?? 0,
        savings: value.savings ?? undefined,
        gallery: value.gallery ?? [],
        variantAxes: value.variantAxes ?? [],
        variants: value.variants ?? [],
        stockQty: value.stockQty ?? 0,
        defaultVariantId: value.defaultVariantId ?? null,
        descriptionHtml: value.descriptionHtml ?? null,
        tabs: value.tabs ?? [],
        specifications: value.specifications ?? [],
        breadcrumbs: value.breadcrumbs ?? [],
        rating: value.rating ?? 0,
        reviewCount: value.reviewCount ?? 0,
        inventoryStatus: value.inventoryStatus ?? 'in_stock',
        publicationStatus: value.publicationStatus ?? 'draft',
        salesClosed: value.salesClosed ?? false,
        isDeactivated: value.isDeactivated ?? false,
        deliveryMethod: value.deliveryMethod ?? null,
        shippingWeightGrams: value.shippingWeightGrams ?? null,
        logisticsCategoryId: value.logisticsCategoryId ?? null,
        packageLengthCm: value.packageLengthCm ?? null,
        packageWidthCm: value.packageWidthCm ?? null,
        packageHeightCm: value.packageHeightCm ?? null,
        recommendedAt: value.recommendedAt ?? null,
        badge: value.badge ?? null,
        categoryId: value.category ?? null,
        subCategoryId: value.subCategory ?? null,
        sellerId: value.seller,
        returnPolicy: value.returnPolicy ?? undefined,
        sections: value.sections ?? [],
        isActive: value.isActive ?? false,
        moderationStatus: value.moderationStatus ?? 'approved',
        moderationReason: value.moderationReason ?? null,
        moderatedAt: value.moderatedAt ?? null,
        salesCount: value.salesCount ?? 0,
        deletedAt: value.deletedAt ?? null,
      },
    });
    return this.legacy(row);
  }

  async getSalesSeries(
    productId: string,
    interval: 'day' | 'week' | 'month',
    from?: Date,
    to?: Date,
  ): Promise<Array<{ bucket: Date; unitsSold: number }>> {
    const range = Prisma.sql`
      ${from ? Prisma.sql`AND o."paidAt" >= ${from}` : Prisma.empty}
      ${to ? Prisma.sql`AND o."paidAt" <= ${to}` : Prisma.empty}
    `;
    return this.prisma.$queryRaw<Array<{ bucket: Date; unitsSold: number }>>(Prisma.sql`
      WITH paid_orders AS (
        SELECT o."id", o."items", o."paidAt"
        FROM "orders" AS o
        WHERE o."deletedAt" IS NULL
          AND o."paymentStatus" = 'paid'
          AND o."paidAt" IS NOT NULL
          ${range}
      ), product_lines AS (
        SELECT o."id" AS "orderId", o."paidAt", line.item
        FROM paid_orders AS o
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o."items", '[]'::jsonb)) AS line(item)
        WHERE line.item ->> 'productId' = ${productId}
      ), net_lines AS (
        SELECT
          date_trunc(${interval}, line."paidAt") AS bucket,
          GREATEST(
            (line.item ->> 'quantity')::INTEGER - COALESCE(refunded.units, 0),
            0
          ) AS units
        FROM product_lines AS line
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(NULLIF(refund_line.item ->> 'quantity', '')::INTEGER), 0)::INTEGER AS units
          FROM "return_requests" AS request
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(request."items", '[]'::jsonb)) AS refund_line(item)
          WHERE request."orderId" = line."orderId"
            AND request."deletedAt" IS NULL
            AND request."refundStatus" = 'completed'
            AND refund_line.item ->> 'productId' = line.item ->> 'productId'
            AND COALESCE(refund_line.item ->> 'variantId', '') = COALESCE(line.item ->> 'variantId', '')
        ) AS refunded ON TRUE
      )
      SELECT bucket, COALESCE(SUM(units), 0)::INTEGER AS "unitsSold"
      FROM net_lines
      GROUP BY bucket
      ORDER BY bucket ASC
    `);
  }

  async update(id: string, data: Partial<Product>): Promise<Product | null> {
    const mapped: any = { ...(data as any) };
    if ('category' in mapped) {
      mapped.categoryId = mapped.category;
      delete mapped.category;
    }
    if ('subCategory' in mapped) {
      mapped.subCategoryId = mapped.subCategory;
      delete mapped.subCategory;
    }
    if ('seller' in mapped) {
      mapped.sellerId = mapped.seller;
      delete mapped.seller;
    }
    if ('stockQty' in mapped || 'variants' in mapped) {
      return this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
        const activeReservations = await tx.inventoryReservation.count({
          where: { productId: id, status: 'held' },
        });
        if (activeReservations > 0) {
          throw new ConflictException('Stock cannot be changed while buyers have unpaid orders');
        }
        try {
          return this.legacy(await tx.product.update({ where: { id }, data: mapped }));
        } catch {
          return null;
        }
      });
    }
    try {
      return this.legacy(await this.prisma.product.update({ where: { id }, data: mapped }));
    } catch {
      return null;
    }
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.product.updateMany({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async findByIdWithSellerOwner(id: string): Promise<Product | null> {
    const row = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { seller: { select: this.cardSeller } },
    });
    return this.legacy(row);
  }

  async findBySellerWithPagination(
    sellerId: string,
    query: ProductQueryDto,
    options?: { includeInactive?: boolean },
  ) {
    return this.findProductPage(
      this.productFilters(query, { sellerId, includeInactive: options?.includeInactive }),
      query,
    );
  }

  async findRecommendedBySeller(sellerId: string): Promise<Product[]> {
    const rows = await this.prisma.product.findMany({
      where: {
        sellerId,
        recommendedAt: { not: null },
        publicationStatus: 'live',
        isActive: true,
        deletedAt: null,
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
      include: { seller: { select: this.cardSeller } },
      orderBy: [{ recommendedAt: 'asc' }, { id: 'asc' }],
      take: 4,
    });
    return rows.map((row) => this.legacy(row));
  }

  async findAllAdmin(page: number, limit: number, includeInactive = true) {
    const where = includeInactive ? {} : { deletedAt: null, isActive: true };
    const [rows, totalItems] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { seller: { select: { id: true, name: true, slug: true } } },
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items: rows.map((row) => this.legacy(row)), totalItems };
  }
}
