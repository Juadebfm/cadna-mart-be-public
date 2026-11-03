import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '@database/prisma.service';
import { createPublicId } from '@database/id.util';
import { CreateMyProductDto } from '@sellers/dto/create-my-product.dto';
import { CsvRecord, parseProductCsv, PRODUCT_IMPORT_TEMPLATE } from './product-bulk-csv';

type ImportError = { rowNumber: number; field: string; message: string };
type StagedProduct = { rowNumber: number; data: Record<string, unknown>; name: string };
type PreviewResult = {
  products: StagedProduct[];
  errors: ImportError[];
};

const PRODUCT_FIELDS = [
  'name',
  'brand',
  'sku',
  'category_id',
  'subcategory_id',
  'price_amount',
  'compare_at_price_amount',
  'description',
  'thumbnail_url',
  'additional_image_urls',
  'delivery_method',
  'shipping_weight_grams',
  'logistics_category_id',
  'package_length_cm',
  'package_width_cm',
  'package_height_cm',
  'option1_name',
  'option2_name',
] as const;

@Injectable()
export class ProductBulkImportService {
  constructor(private readonly prisma: PrismaService) {}

  template(): string {
    return PRODUCT_IMPORT_TEMPLATE;
  }

  async preview(file: Buffer, userId: string): Promise<object> {
    const seller = await this.prisma.seller.findFirst({
      where: { ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!seller) throw new NotFoundException('Seller profile not found');

    const rows = parseProductCsv(file);
    if (rows.length > 1000) throw new BadRequestException('A CSV can contain at most 1,000 rows');
    const parsed = await this.parseProducts(rows);
    parsed.products = parsed.products.map((product) => ({
      ...product,
      data: { ...product.data, sellerId: seller.id },
    }));
    const categoryIds = [
      ...new Set(
        parsed.products.flatMap(({ data }) =>
          [data.categoryId, data.subCategoryId].filter(
            (value): value is string => typeof value === 'string' && value.length > 0,
          ),
        ),
      ),
    ];
    if (categoryIds.length) {
      const categories = await this.prisma.category.findMany({
        where: { id: { in: categoryIds }, deletedAt: null, isActive: true },
        select: { id: true, parentId: true },
      });
      const byId = new Map(categories.map((category) => [category.id, category]));
      for (const product of parsed.products) {
        const categoryId = product.data.categoryId as string | undefined;
        const subcategoryId = product.data.subCategoryId as string | undefined;
        if (categoryId && !byId.has(categoryId)) {
          parsed.errors.push({
            rowNumber: product.rowNumber,
            field: 'category_id',
            message: 'Category was not found',
          });
        }
        if (subcategoryId && !byId.has(subcategoryId)) {
          parsed.errors.push({
            rowNumber: product.rowNumber,
            field: 'subcategory_id',
            message: 'Subcategory was not found',
          });
        } else if (
          subcategoryId &&
          categoryId &&
          byId.get(subcategoryId)?.parentId !== categoryId
        ) {
          parsed.errors.push({
            rowNumber: product.rowNumber,
            field: 'subcategory_id',
            message: 'Subcategory does not belong to this category',
          });
        }
      }
    }

    await this.prisma.productImportBatch.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const id = createPublicId();
    const batch = await this.prisma.productImportBatch.create({
      data: {
        id,
        sellerId: seller.id,
        products: parsed.products as any,
        errors: parsed.errors as any,
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
    });
    return {
      previewId: batch.id,
      expiresAt: batch.expiresAt,
      totalProducts: parsed.products.length,
      validProducts: parsed.errors.length ? 0 : parsed.products.length,
      errorCount: parsed.errors.length,
      errors: parsed.errors,
      products: parsed.products.map(({ rowNumber, name, data }) => ({
        rowNumber,
        name,
        variantCount: Array.isArray(data.variants) ? data.variants.length : 0,
      })),
    };
  }

  async commit(previewId: string, userId: string): Promise<object> {
    const seller = await this.prisma.seller.findFirst({
      where: { ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!seller) throw new NotFoundException('Seller profile not found');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM product_import_batches WHERE id = ${previewId} FOR UPDATE`;
      const batch = await tx.productImportBatch.findFirst({
        where: { id: previewId, sellerId: seller.id },
      });
      if (!batch) throw new NotFoundException('Import preview was not found');
      if (batch.status === 'committed') return batch.result as object;
      if (batch.expiresAt <= new Date())
        throw new BadRequestException('Import preview expired; upload the CSV again');
      const errors = Array.isArray(batch.errors) ? (batch.errors as ImportError[]) : [];
      if (errors.length) {
        throw new BadRequestException({
          message: 'Fix the CSV errors before creating products',
          errors,
        });
      }

      const products = Array.isArray(batch.products) ? (batch.products as StagedProduct[]) : [];
      const created: Array<{ id: string; name: string; rowNumber: number }> = [];
      for (const product of products) {
        await tx.product.create({ data: product.data as any });
        created.push({
          id: String(product.data.id),
          name: product.name,
          rowNumber: product.rowNumber,
        });
      }
      const result = { status: 'committed', createdCount: created.length, products: created };
      await tx.productImportBatch.update({
        where: { id: previewId },
        data: { status: 'committed', result: result as any },
      });
      return result;
    });
  }

  private async parseProducts(rows: CsvRecord[]): Promise<PreviewResult> {
    const groups = new Map<string, CsvRecord[]>();
    const errors: ImportError[] = [];
    for (const row of rows) {
      const key = row.values.product_key;
      if (!key) {
        errors.push({
          rowNumber: row.rowNumber,
          field: 'product_key',
          message: 'Product key is required',
        });
        continue;
      }
      const group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
    }
    if (groups.size > 500) throw new BadRequestException('A CSV can contain at most 500 products');

    const products: StagedProduct[] = [];
    for (const [key, group] of groups) {
      const firstRow = group[0].rowNumber;
      const merged: Record<string, string> = { product_key: key };
      for (const field of PRODUCT_FIELDS) {
        const column = field as string;
        const values = group
          .map((row) => row.values[column] ?? '')
          .filter((value) => value.length > 0);
        if (new Set(values).size > 1) {
          for (const row of group) {
            if (row.values[column]) {
              errors.push({
                rowNumber: row.rowNumber,
                field: column,
                message: 'Product details must match on every variant row',
              });
            }
          }
        }
        merged[column] = values[0] ?? '';
      }

      const hasVariantData = group.some((row) =>
        [
          'option1_name',
          'option1_value',
          'option2_name',
          'option2_value',
          'variant_sku',
          'variant_price_adjustment_amount',
          'variant_stock_qty',
          'variant_image_urls',
        ].some((field) => Boolean(row.values[field])),
      );
      const variants: Array<Record<string, unknown>> = [];
      let axes: Array<Record<string, unknown>> = [];
      if (hasVariantData) {
        const axisColumns = [
          { name: merged.option1_name, field: 'option1_value' },
          { name: merged.option2_name, field: 'option2_value' },
        ].filter((axis) => Boolean(axis.name));
        const axisNames = axisColumns.map((axis) => axis.name);
        if (!axisNames.length || new Set(axisNames).size !== axisNames.length) {
          errors.push({
            rowNumber: firstRow,
            field: 'option1_name',
            message: 'Variant products need one or two different option names',
          });
        }
        const combinations = new Set<string>();
        const variantSkus = new Set<string>();
        for (const row of group) {
          const values = axisColumns.map((axis) => row.values[axis.field] ?? '');
          const valueWithoutName =
            (!merged.option1_name && row.values.option1_value) ||
            (!merged.option2_name && row.values.option2_value);
          if (
            valueWithoutName ||
            values.some((value) => !value) ||
            !row.values.variant_sku ||
            !row.values.variant_stock_qty
          ) {
            errors.push({
              rowNumber: row.rowNumber,
              field: 'variant_sku',
              message: 'Each variant row needs option values, a variant SKU, and variant stock',
            });
            continue;
          }
          const combo = values.join('\u001f').toLowerCase();
          if (combinations.has(combo))
            errors.push({
              rowNumber: row.rowNumber,
              field: 'option1_value',
              message: 'This variant combination is repeated',
            });
          combinations.add(combo);
          if (variantSkus.has(row.values.variant_sku))
            errors.push({
              rowNumber: row.rowNumber,
              field: 'variant_sku',
              message: 'Variant SKUs must be unique within a product',
            });
          variantSkus.add(row.values.variant_sku);
          const attributes = Object.fromEntries(
            axisNames.map((name, index) => [name, values[index]]),
          );
          const stockQty = this.integer(
            row.values.variant_stock_qty,
            row.rowNumber,
            'variant_stock_qty',
            errors,
            true,
          );
          const adjustment = this.number(
            row.values.variant_price_adjustment_amount,
            row.rowNumber,
            'variant_price_adjustment_amount',
            errors,
            true,
          );
          variants.push({
            id: randomUUID(),
            sku: row.values.variant_sku,
            attributes,
            stockQty: stockQty ?? 0,
            priceAdjustmentAmount: adjustment ?? 0,
            images: this.urlList(
              row.values.variant_image_urls,
              row.rowNumber,
              'variant_image_urls',
              errors,
            ),
          });
        }
        axes = axisColumns.map(({ name, field }) => ({
          name,
          displayName: name,
          options: [...new Set(group.map((row) => row.values[field]).filter(Boolean))].map(
            (label) => ({ id: randomUUID(), label, swatchHex: null }),
          ),
        }));
      }

      const priceAmount = this.number(merged.price_amount, firstRow, 'price_amount', errors);
      for (const variant of variants) {
        if (
          priceAmount !== undefined &&
          priceAmount + Number(variant.priceAdjustmentAmount ?? 0) < 0
        ) {
          errors.push({
            rowNumber: firstRow,
            field: 'variant_price_adjustment_amount',
            message: 'Variant price cannot be below zero',
          });
        }
      }
      const originalPriceAmount = this.number(
        merged.compare_at_price_amount,
        firstRow,
        'compare_at_price_amount',
        errors,
      );
      const stockQty = hasVariantData
        ? variants.reduce((sum, variant) => sum + Number(variant.stockQty ?? 0), 0)
        : (this.integer(group[0].values.stock_qty, firstRow, 'stock_qty', errors, false) ?? 0);
      const gallery = this.urlList(
        merged.additional_image_urls,
        firstRow,
        'additional_image_urls',
        errors,
      ).map((url) => ({ id: randomUUID(), url, alt: null }));
      const dto = {
        name: merged.name,
        brand: merged.brand || undefined,
        sku: merged.sku || undefined,
        categoryId: merged.category_id || undefined,
        subCategoryId: merged.subcategory_id || undefined,
        priceAmount: priceAmount ?? 0,
        originalPriceAmount,
        descriptionHtml: merged.description || undefined,
        thumbnailUrl: merged.thumbnail_url || undefined,
        gallery,
        stockQty,
        deliveryMethod: merged.delivery_method || undefined,
        shippingWeightGrams: this.integer(
          merged.shipping_weight_grams,
          firstRow,
          'shipping_weight_grams',
          errors,
          false,
        ),
        logisticsCategoryId: this.integer(
          merged.logistics_category_id,
          firstRow,
          'logistics_category_id',
          errors,
          false,
        ),
        packageLengthCm: this.number(
          merged.package_length_cm,
          firstRow,
          'package_length_cm',
          errors,
        ),
        packageWidthCm: this.number(merged.package_width_cm, firstRow, 'package_width_cm', errors),
        packageHeightCm: this.number(
          merged.package_height_cm,
          firstRow,
          'package_height_cm',
          errors,
        ),
        variantAxes: axes,
        variants,
        defaultVariantId: variants[0]?.id,
      };
      const validation = await validate(plainToInstance(CreateMyProductDto, dto));
      const addValidationErrors = (items: typeof validation, prefix = '') => {
        for (const item of items) {
          for (const message of Object.values(item.constraints ?? {})) {
            errors.push({ rowNumber: firstRow, field: `${prefix}${item.property}`, message });
          }
          addValidationErrors(item.children ?? [], `${prefix}${item.property}.`);
        }
      };
      addValidationErrors(validation);
      if (!merged.name)
        errors.push({ rowNumber: firstRow, field: 'name', message: 'Product name is required' });
      if (priceAmount === undefined)
        errors.push({
          rowNumber: firstRow,
          field: 'price_amount',
          message: 'Selling price is required and must be a number',
        });
      if (
        originalPriceAmount !== undefined &&
        priceAmount !== undefined &&
        originalPriceAmount < priceAmount
      ) {
        errors.push({
          rowNumber: firstRow,
          field: 'compare_at_price_amount',
          message: 'Compare-at price must be at least the selling price',
        });
      }

      if (errors.every((error) => !group.some((row) => row.rowNumber === error.rowNumber))) {
        const id = createPublicId();
        const price = this.money(priceAmount ?? 0);
        const originalPrice =
          originalPriceAmount === undefined ? null : this.money(originalPriceAmount);
        const discountPercent =
          originalPriceAmount && originalPriceAmount > (priceAmount ?? 0)
            ? Math.round(((originalPriceAmount - (priceAmount ?? 0)) / originalPriceAmount) * 100)
            : 0;
        const normalizedVariants = variants.map((variant) => {
          const adjustment = Number(variant.priceAdjustmentAmount ?? 0);
          return {
            ...variant,
            price: this.money((priceAmount ?? 0) + adjustment),
            priceAdjustment: this.money(adjustment),
            isInStock: Number(variant.stockQty ?? 0) > 0,
          };
        });
        const data = {
          id,
          name: merged.name,
          slug: `${this.slug(merged.name)}-${id}`,
          sku: merged.sku || null,
          brand: merged.brand || null,
          thumbnailUrl: merged.thumbnail_url || gallery[0]?.url || null,
          price,
          originalPrice,
          discountPercent,
          savings:
            originalPriceAmount && originalPriceAmount > (priceAmount ?? 0)
              ? this.money(originalPriceAmount - (priceAmount ?? 0))
              : null,
          gallery,
          variantAxes: axes,
          variants: normalizedVariants,
          stockQty,
          defaultVariantId: (variants[0]?.id as string | undefined) ?? null,
          descriptionHtml: merged.description || null,
          tabs: [],
          specifications: [],
          breadcrumbs: [],
          rating: 0,
          reviewCount: 0,
          inventoryStatus: stockQty > 0 ? 'in_stock' : 'out_of_stock',
          publicationStatus: 'draft',
          salesClosed: false,
          isDeactivated: false,
          deliveryMethod: merged.delivery_method || null,
          shippingWeightGrams: dto.shippingWeightGrams ?? null,
          logisticsCategoryId: dto.logisticsCategoryId ?? null,
          packageLengthCm: dto.packageLengthCm ?? null,
          packageWidthCm: dto.packageWidthCm ?? null,
          packageHeightCm: dto.packageHeightCm ?? null,
          recommendedAt: null,
          badge: null,
          categoryId: merged.category_id || null,
          subCategoryId: merged.subcategory_id || null,
          sellerId: '',
          returnPolicy: null,
          sections: [],
          isActive: false,
          moderationStatus: 'approved',
          moderationReason: null,
          moderatedAt: null,
          salesCount: 0,
          deletedAt: null,
        };
        products.push({ rowNumber: firstRow, name: merged.name, data });
      }
    }
    return { products, errors };
  }

  private number(
    value: string | undefined,
    rowNumber: number,
    field: string,
    errors: ImportError[],
    allowNegative = false,
  ): number | undefined {
    if (!value) return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || (!allowNegative && parsed < 0)) {
      errors.push({
        rowNumber,
        field,
        message: allowNegative ? 'Enter a valid number' : 'Enter a number that is zero or greater',
      });
      return undefined;
    }
    return parsed;
  }

  private integer(
    value: string | undefined,
    rowNumber: number,
    field: string,
    errors: ImportError[],
    required: boolean,
  ): number | undefined {
    if (!value) {
      if (required) errors.push({ rowNumber, field, message: 'This field is required' });
      return undefined;
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      errors.push({ rowNumber, field, message: 'Enter a whole number that is zero or greater' });
      return undefined;
    }
    return parsed;
  }

  private urlList(
    value: string | undefined,
    rowNumber: number,
    field: string,
    errors: ImportError[],
  ): string[] {
    if (!value) return [];
    const urls = value
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);
    for (const url of urls) {
      try {
        if (new URL(url).protocol !== 'https:') throw new Error('https required');
      } catch {
        errors.push({ rowNumber, field, message: 'Use HTTPS image URLs separated by |' });
      }
    }
    return urls;
  }

  private money(amount: number) {
    return { amount, currency: 'NGN', formatted: `₦${amount.toLocaleString('en-NG')}` };
  }

  private slug(value: string) {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'product'
    );
  }
}
