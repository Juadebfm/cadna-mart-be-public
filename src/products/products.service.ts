import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ProductsRepository } from './products.repository';
import { ProductQueryDto } from './dto/product-query.dto';
import { ProductSalesQueryDto } from './dto/product-sales-query.dto';
import { CategoriesService } from '@categories/categories.service';
import { Product } from './schemas/product.schema';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AccountType } from '@users/enums/account-type.enum';

@Injectable()
export class ProductsService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly categoriesService: CategoriesService,
  ) {}

  async findAll(query: ProductQueryDto) {
    const resolvedQuery: ProductQueryDto = { ...query };
    let categoryIds: string[] | undefined;
    let subCategoryIds: string[] | undefined;

    if (query.category) {
      const cat = await this.categoriesService.findBySlug(query.category);
      if (cat) {
        // "deals" is a promotional rail that spans all categories.
        if (cat.slug === 'deals') {
          resolvedQuery.section = 'best_deals';
        } else {
          categoryIds = [cat.id];
        }
      }
    }

    if (query.subCategory && query.category !== 'deals') {
      const subCat = await this.categoriesService.findBySlug(query.subCategory);
      if (subCat) {
        subCategoryIds = [subCat.id];
      }
    }

    const { items, totalItems } = await this.productsRepository.findWithPagination(
      resolvedQuery,
      categoryIds,
      subCategoryIds,
    );

    const totalPages = Math.ceil(totalItems / resolvedQuery.limit);

    return {
      items: items.map((p) => this.toCard(p)),
      pagination: {
        page: resolvedQuery.page,
        limit: resolvedQuery.limit,
        totalItems,
        totalPages,
        hasNextPage: resolvedQuery.page < totalPages,
        hasPrevPage: resolvedQuery.page > 1,
      },
    };
  }

  async findBySlug(slug: string, variantId?: string) {
    const product = await this.productsRepository.findBySlug(slug);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return this.toDetail(product, variantId);
  }

  async findByIdOrSlug(idOrSlug: string, variantId?: string) {
    const isPublicId = /^[a-f\d]{24}$/i.test(idOrSlug);
    const product = isPublicId
      ? await this.productsRepository.findById(idOrSlug)
      : await this.productsRepository.findBySlug(idOrSlug);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return this.toDetail(product, variantId);
  }

  async resolveProductId(idOrSlug: string): Promise<string> {
    const isPublicId = /^[a-f\d]{24}$/i.test(idOrSlug);
    if (isPublicId) return idOrSlug;
    const product = await this.productsRepository.findBySlug(idOrSlug);
    if (!product) throw new NotFoundException('Product not found');
    return (product as unknown as { _id: { toString(): string } })._id.toString();
  }

  async getVariants(idOrSlug: string) {
    const isPublicId = /^[a-f\d]{24}$/i.test(idOrSlug);
    const product = isPublicId
      ? await this.productsRepository.findById(idOrSlug)
      : await this.productsRepository.findBySlug(idOrSlug);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return {
      productId: (product as unknown as { _id: { toString(): string } })._id.toString(),
      variantAxes: product.variantAxes,
      variants: product.variants,
      defaultVariantId: product.defaultVariantId,
    };
  }

  async getAvailability(idOrSlug: string) {
    const isPublicId = /^[a-f\d]{24}$/i.test(idOrSlug);
    const product = isPublicId
      ? await this.productsRepository.findById(idOrSlug)
      : await this.productsRepository.findBySlug(idOrSlug);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const variantSummaries = product.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      inStock: v.isInStock,
      stockQty: v.stockQty,
    }));
    const anyVariantInStock = variantSummaries.some((v) => v.inStock && v.stockQty > 0);
    const productInStock =
      product.inventoryStatus === 'in_stock' &&
      (variantSummaries.length === 0 || anyVariantInStock);
    return {
      productId: (product as unknown as { _id: { toString(): string } })._id.toString(),
      productInStock,
      inventoryStatus: product.inventoryStatus,
      salesClosed: (product as any).salesClosed ?? false,
      purchasable: product.isActive && !(product as any).salesClosed && productInStock,
      variants: variantSummaries,
    };
  }

  async findRelated(idOrSlug: string, limit: number) {
    const id = await this.resolveProductId(idOrSlug);
    const items = await this.productsRepository.findRelated(id, limit);
    return { items: items.map((p) => this.toCard(p)) };
  }

  async findBySection(section: string, limit: number): Promise<Product[]> {
    return this.productsRepository.findBySection(section, limit);
  }

  async findBySeller(sellerSlug: string, query: ProductQueryDto) {
    const seller = await this.productsRepository.prisma.seller.findFirst({
      where: { slug: sellerSlug, deletedAt: null, isActive: true },
    });

    if (!seller) throw new NotFoundException('Seller not found');

    const sellerId = seller.id;
    const { items, totalItems } = await this.productsRepository.findBySellerWithPagination(
      sellerId,
      query,
      { includeInactive: false },
    );

    const totalPages = Math.ceil(totalItems / query.limit);

    return {
      seller: {
        id: sellerId,
        name: seller.name,
        slug: seller.slug,
        logoUrl: seller.logoUrl ?? null,
        isVerified: seller.isVerified ?? false,
      },
      items: items.map((p: Product) => this.toCard(p)),
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

  private toMoney(amount: number) {
    return {
      amount,
      currency: 'NGN',
      formatted: `₦${amount.toLocaleString('en-NG')}`,
    };
  }

  private buildVariants(
    variants: Array<{
      id: string;
      sku: string;
      attributes: Record<string, string>;
      priceAmount?: number;
      priceAdjustmentAmount?: number;
      stockQty?: number;
      images?: string[];
    }>,
    basePrice: number,
  ) {
    return variants.map((variant) => {
      const adjustment =
        variant.priceAdjustmentAmount ??
        (variant.priceAmount === undefined ? 0 : variant.priceAmount - basePrice);
      const finalPrice = basePrice + adjustment;
      if (!Number.isFinite(finalPrice) || finalPrice < 0) {
        throw new BadRequestException('Variant selling price cannot be below zero');
      }
      return {
        id: variant.id,
        sku: variant.sku,
        attributes: variant.attributes,
        price: this.toMoney(finalPrice),
        priceAdjustment: this.toMoney(adjustment),
        stockQty: variant.stockQty ?? 0,
        isInStock: (variant.stockQty ?? 0) > 0,
        images: variant.images ?? [],
      };
    });
  }

  private totalStock(variants: Array<{ stockQty?: number }> | undefined, stockQty = 0): number {
    return variants?.length
      ? variants.reduce((total, variant) => total + (variant.stockQty ?? 0), 0)
      : stockQty;
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async createProduct(dto: CreateProductDto, currentUser: { userId: string; accountType: string }) {
    let sellerId = dto.sellerId;
    // Seller-created products are always attached to the authenticated seller.
    if (currentUser.accountType === AccountType.SELLER) {
      const profile = await this.productsRepository.prisma.sellerProfile.findUnique({
        where: { userId: currentUser.userId },
      });
      if (!profile) throw new ForbiddenException('Complete your seller application first');
      const seller = await this.productsRepository.prisma.seller.findFirst({
        where: { ownerId: currentUser.userId, deletedAt: null },
        select: { id: true },
      });
      if (!seller || (dto.sellerId && dto.sellerId !== seller.id)) {
        throw new ForbiddenException('You can only create products for your own store');
      }
      sellerId = seller.id;
    }

    const { priceAmount, originalPriceAmount } = dto;

    const discountPercent =
      dto.discountPercent ??
      (originalPriceAmount && originalPriceAmount > priceAmount
        ? Math.round(((originalPriceAmount - priceAmount) / originalPriceAmount) * 100)
        : 0);

    const savings =
      originalPriceAmount && originalPriceAmount > priceAmount
        ? this.toMoney(originalPriceAmount - priceAmount)
        : null;

    const variants = this.buildVariants(dto.variants ?? [], priceAmount);
    const stockQty = this.totalStock(variants, dto.stockQty ?? 0);

    const baseSlug = this.slugify(dto.name);
    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    const product = await this.productsRepository.create({
      name: dto.name,
      slug,
      sku: dto.sku ?? null,
      brand: dto.brand ?? null,
      thumbnailUrl: dto.thumbnailUrl ?? null,
      price: this.toMoney(priceAmount),
      originalPrice: originalPriceAmount ? this.toMoney(originalPriceAmount) : null,
      discountPercent,
      savings,
      gallery: dto.gallery ?? [],
      variantAxes: dto.variantAxes ?? [],
      variants,
      defaultVariantId: dto.defaultVariantId ?? variants[0]?.id ?? null,
      descriptionHtml: dto.descriptionHtml ?? null,
      tabs: dto.tabs ?? [],
      specifications: dto.specifications ?? [],
      breadcrumbs: dto.breadcrumbs ?? [],
      badge: dto.badge ?? null,
      sections: dto.sections ?? [],
      inventoryStatus: stockQty > 0 ? 'in_stock' : 'out_of_stock',
      stockQty,
      publicationStatus: 'draft',
      salesClosed: false,
      isDeactivated: false,
      deliveryMethod: dto.deliveryMethod ?? null,
      shippingWeightGrams: dto.shippingWeightGrams ?? null,
      logisticsCategoryId: dto.logisticsCategoryId ?? null,
      packageLengthCm: dto.packageLengthCm ?? null,
      packageWidthCm: dto.packageWidthCm ?? null,
      packageHeightCm: dto.packageHeightCm ?? null,
      recommendedAt: null,
      isActive: false,
      moderationStatus: 'approved',
      moderationReason: null,
      moderatedAt: null,
      seller: sellerId as any,
      category: (dto.categoryId as any) ?? null,
      subCategory: (dto.subCategoryId as any) ?? null,
      returnPolicy: dto.returnPolicy ?? null,
      rating: 0,
      reviewCount: 0,
      salesCount: 0,
      deletedAt: null,
    } as any);

    const createdId = (product as unknown as { _id: { toString(): string } })._id.toString();
    const populated = await this.productsRepository.findByIdWithSeller(createdId);
    return this.toCard((populated ?? product) as any);
  }

  async updateProduct(
    id: string,
    dto: UpdateProductDto,
    currentUser: { userId: string; accountType: string },
  ) {
    const product = await this.productsRepository.findByIdWithSellerOwner(id);
    if (!product) throw new NotFoundException('Product not found');

    if (currentUser.accountType !== AccountType.ADMIN) {
      const sellerOwner = (product.seller as any)?.owner?.toString();
      if (sellerOwner !== currentUser.userId) {
        throw new ForbiddenException('You do not own this product');
      }
    }

    const updates: Record<string, unknown> = {};

    if (dto.name !== undefined) {
      updates.name = dto.name;
    }
    if (dto.brand !== undefined) updates.brand = dto.brand;
    if (dto.sku !== undefined) updates.sku = dto.sku;
    if (dto.thumbnailUrl !== undefined) updates.thumbnailUrl = dto.thumbnailUrl;
    if (dto.descriptionHtml !== undefined) updates.descriptionHtml = dto.descriptionHtml;
    if (dto.badge !== undefined) updates.badge = dto.badge;
    if (dto.sections !== undefined) updates.sections = dto.sections;
    // Public visibility is controlled by explicit publication/deactivation actions.
    if (dto.deliveryMethod !== undefined) updates.deliveryMethod = dto.deliveryMethod;
    if (dto.shippingWeightGrams !== undefined)
      updates.shippingWeightGrams = dto.shippingWeightGrams;
    if (dto.logisticsCategoryId !== undefined)
      updates.logisticsCategoryId = dto.logisticsCategoryId;
    if (dto.packageLengthCm !== undefined) updates.packageLengthCm = dto.packageLengthCm;
    if (dto.packageWidthCm !== undefined) updates.packageWidthCm = dto.packageWidthCm;
    if (dto.packageHeightCm !== undefined) updates.packageHeightCm = dto.packageHeightCm;
    if (dto.gallery !== undefined) updates.gallery = dto.gallery;
    if (dto.variantAxes !== undefined) updates.variantAxes = dto.variantAxes;
    if (dto.tabs !== undefined) updates.tabs = dto.tabs;
    if (dto.specifications !== undefined) updates.specifications = dto.specifications;
    if (dto.breadcrumbs !== undefined) updates.breadcrumbs = dto.breadcrumbs;
    if (dto.categoryId !== undefined) updates.category = dto.categoryId;
    if (dto.subCategoryId !== undefined) updates.subCategory = dto.subCategoryId;
    if (dto.defaultVariantId !== undefined) updates.defaultVariantId = dto.defaultVariantId;
    if (dto.returnPolicy !== undefined) updates.returnPolicy = dto.returnPolicy;

    const prospectiveProduct = { ...product, ...dto } as Product;
    const remainsLive = (product as any).publicationStatus === 'live';
    const shippingFieldsChanged = [
      dto.deliveryMethod,
      dto.shippingWeightGrams,
      dto.logisticsCategoryId,
      dto.packageLengthCm,
      dto.packageWidthCm,
      dto.packageHeightCm,
    ].some((value) => value !== undefined);
    if (remainsLive && shippingFieldsChanged && prospectiveProduct.deliveryMethod) {
      await this.assertPickupAddressConfirmed(product);
      this.assertCourierParcelDetails(prospectiveProduct);
    }

    if (dto.priceAmount !== undefined) {
      updates.price = this.toMoney(dto.priceAmount);
      if (dto.variants === undefined && product.variants.length > 0) {
        const oldBase = Number(product.price?.amount ?? 0);
        updates.variants = product.variants.map((variant) => {
          const adjustment = Number(
            variant.priceAdjustment?.amount ?? Number(variant.price?.amount ?? oldBase) - oldBase,
          );
          return {
            ...variant,
            price: this.toMoney(dto.priceAmount! + adjustment),
            priceAdjustment: this.toMoney(adjustment),
          };
        });
      }
    }
    if (dto.originalPriceAmount !== undefined) {
      updates.originalPrice = this.toMoney(dto.originalPriceAmount);
      if (dto.priceAmount !== undefined && dto.originalPriceAmount > dto.priceAmount) {
        updates.savings = this.toMoney(dto.originalPriceAmount - dto.priceAmount);
        updates.discountPercent = Math.round(
          ((dto.originalPriceAmount - dto.priceAmount) / dto.originalPriceAmount) * 100,
        );
      }
    }
    if (dto.discountPercent !== undefined) updates.discountPercent = dto.discountPercent;

    if (dto.variants !== undefined) {
      updates.variants = this.buildVariants(
        dto.variants,
        dto.priceAmount ?? Number(product.price?.amount ?? 0),
      );
      const nextStock = this.totalStock(dto.variants, dto.stockQty ?? 0);
      updates.stockQty = nextStock;
      updates.inventoryStatus = nextStock > 0 ? 'in_stock' : 'out_of_stock';
    } else if (dto.stockQty !== undefined && product.variants.length === 0) {
      updates.stockQty = dto.stockQty;
      updates.inventoryStatus = dto.stockQty > 0 ? 'in_stock' : 'out_of_stock';
    }

    const updated = await this.productsRepository.update(id, updates as any);
    if (!updated) throw new NotFoundException('Product not found');
    const populated = await this.productsRepository.findByIdWithSeller(id);
    return this.toCard((populated ?? updated) as any);
  }

  async removeProduct(
    id: string,
    currentUser: { userId: string; accountType: string },
  ): Promise<void> {
    const product = await this.productsRepository.findByIdWithSellerOwner(id);
    if (!product) throw new NotFoundException('Product not found');

    if (currentUser.accountType !== AccountType.ADMIN) {
      const sellerOwner = (product.seller as any)?.owner?.toString();
      if (sellerOwner !== currentUser.userId) {
        throw new ForbiddenException('You do not own this product');
      }
    }

    await this.productsRepository.softDelete(id);
  }

  toCard(product: Product) {
    const id = (product as unknown as { _id: { toString(): string } })._id.toString();
    const seller = product.seller as unknown as {
      _id: { toString(): string };
      name: string;
      slug: string;
      isVerified: boolean;
      location: string | null;
      deliveryTimeRange: string | null;
    } | null;

    return {
      id,
      slug: product.slug,
      name: product.name,
      brand: product.brand,
      thumbnailUrl: product.thumbnailUrl,
      price: product.price,
      originalPrice: product.originalPrice,
      savings: product.savings,
      discountPercent: product.discountPercent,
      rating: product.rating,
      reviewCount: product.reviewCount,
      inventoryStatus: product.inventoryStatus,
      salesClosed: (product as any).salesClosed ?? false,
      canPurchase:
        product.isActive && !(product as any).salesClosed && product.inventoryStatus === 'in_stock',
      badge: product.badge,
      seller: seller
        ? {
            id: seller._id.toString(),
            name: seller.name,
            isVerified: seller.isVerified,
            location: seller.location,
            deliveryTimeRange: seller.deliveryTimeRange,
          }
        : null,
    };
  }

  toManageCard(product: Product) {
    return {
      ...this.toCard(product),
      isActive: product.isActive,
      stockQty: (product as any).stockQty ?? 0,
      publicationStatus: (product as any).publicationStatus ?? 'draft',
      salesClosed: (product as any).salesClosed ?? false,
      isDeactivated: (product as any).isDeactivated ?? false,
      deliveryMethod: (product as any).deliveryMethod ?? null,
      shippingWeightGrams: (product as any).shippingWeightGrams ?? null,
      logisticsCategoryId: (product as any).logisticsCategoryId ?? null,
      packageLengthCm: (product as any).packageLengthCm ?? null,
      packageWidthCm: (product as any).packageWidthCm ?? null,
      packageHeightCm: (product as any).packageHeightCm ?? null,
      recommendedAt: (product as any).recommendedAt ?? null,
      sections: product.sections ?? [],
      moderationStatus: (product as any).moderationStatus ?? 'approved',
      moderationReason: (product as any).moderationReason ?? null,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  async findMyProducts(ownerId: string, query: ProductQueryDto) {
    const seller = await this.getSellerByOwner(ownerId);
    const sellerId = seller.id;
    const { items, totalItems } = await this.productsRepository.findBySellerWithPagination(
      sellerId,
      query,
      { includeInactive: true },
    );
    const totalPages = Math.ceil(totalItems / query.limit);

    return {
      seller: {
        id: sellerId,
        name: seller.name,
        slug: seller.slug,
        logoUrl: seller.logoUrl ?? null,
        isVerified: seller.isVerified ?? false,
      },
      items: items.map((product) => this.toManageCard(product)),
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

  async getMyProductSales(
    productId: string,
    currentUser: { userId: string; accountType: string },
    query: ProductSalesQueryDto,
  ) {
    const product = await this.getOwnedProduct(productId, currentUser);
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from > to) {
      throw new BadRequestException('The start date must be earlier than or equal to the end date');
    }
    const interval = query.interval ?? 'month';
    const series = await this.productsRepository.getSalesSeries(
      (product as any)._id.toString(),
      interval,
      from,
      to,
    );
    return {
      product: { id: (product as any)._id.toString(), name: product.name },
      interval,
      range: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
      series: series.map((point) => ({
        periodStart: point.bucket.toISOString(),
        unitsSold: point.unitsSold,
      })),
    };
  }

  async findMyRecommendations(ownerId: string) {
    const seller = await this.getSellerByOwner(ownerId);
    const products = await this.productsRepository.findRecommendedBySeller(seller.id);
    return { items: products.map((product) => this.toManageCard(product)) };
  }

  async findRecommendationsBySeller(sellerSlug: string) {
    const seller = await this.productsRepository.prisma.seller.findFirst({
      where: { slug: sellerSlug, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!seller) throw new NotFoundException('Seller not found');
    const products = await this.productsRepository.findRecommendedBySeller(seller.id);
    return { items: products.map((product) => this.toCard(product)) };
  }

  async createMyProduct(
    dto: Omit<CreateProductDto, 'sellerId'>,
    currentUser: { userId: string; accountType: string },
  ) {
    const seller = await this.getSellerByOwner(currentUser.userId);
    const sellerId = seller.id;
    const created = (await this.createProduct({ ...dto, sellerId }, currentUser)) as unknown as {
      id?: string;
    };

    if (!created.id) {
      return created;
    }

    const populated = await this.productsRepository.findByIdWithSeller(created.id);
    return populated ? this.toManageCard(populated) : created;
  }

  async attachProductImages(
    id: string,
    images: Array<{ url: string; alt?: string | null }>,
    currentUser: { userId: string; accountType: string },
  ) {
    const product = await this.getOwnedProduct(id, currentUser);
    const currentGallery = product.gallery ?? [];
    const nextGallery = [
      ...currentGallery,
      ...images.map((image) => ({
        id: randomUUID(),
        url: image.url,
        alt: image.alt ?? null,
      })),
    ];

    const updates: Record<string, unknown> = { gallery: nextGallery };
    if (!product.thumbnailUrl && nextGallery.length > 0) {
      updates.thumbnailUrl = nextGallery[0].url;
    }

    const updated = await this.productsRepository.update(id, updates as any);
    if (!updated) {
      throw new NotFoundException('Product not found');
    }

    const populated = await this.productsRepository.findByIdWithSeller(id);
    return populated ? this.toManageCard(populated) : this.toManageCard(updated as any);
  }

  async setPublicationStatus(
    id: string,
    publicationStatus: 'draft' | 'live',
    currentUser: { userId: string; accountType: string },
  ) {
    const product = await this.getOwnedProduct(id, currentUser);
    if (publicationStatus === 'live' && product.moderationStatus !== 'approved') {
      throw new BadRequestException('This product is not approved for publication');
    }
    if (publicationStatus === 'live') {
      await this.assertPickupAddressConfirmed(product);
      this.assertCourierParcelDetails(product);
    }
    // Public repository queries also require the seller's application and KYC to be approved.
    // Keeping the product's requested Live state here lets it become visible automatically
    // when the seller clears those gates, without an admin needing to republish it.
    const isActive =
      publicationStatus === 'live' &&
      !(product as any).isDeactivated &&
      product.moderationStatus === 'approved';
    const updated = await this.productsRepository.update(id, {
      publicationStatus,
      isActive,
      ...(publicationStatus === 'draft' ? { recommendedAt: null } : {}),
    } as any);
    if (!updated) throw new NotFoundException('Product not found');
    const populated = await this.productsRepository.findByIdWithSeller(id);
    return this.toManageCard((populated ?? updated) as any);
  }

  private async assertPickupAddressConfirmed(product: Product): Promise<void> {
    if (!(product as any).deliveryMethod) return;
    const sellerId = (product.seller as any)?._id?.toString();
    const seller = sellerId
      ? await this.productsRepository.prisma.seller.findUnique({
          where: { id: sellerId },
          select: { pickupAddressConfirmedAt: true },
        })
      : null;
    if (!seller?.pickupAddressConfirmedAt) {
      throw new BadRequestException(
        'Confirm your courier pickup address before setting this product Live',
      );
    }
  }

  private assertCourierParcelDetails(product: Product): void {
    if (!['cadna_logistics', 'partner_courier'].includes(product.deliveryMethod ?? '')) return;
    if (
      !Number.isSafeInteger(product.shippingWeightGrams) ||
      !Number.isSafeInteger(product.logisticsCategoryId) ||
      !Number.isFinite(product.packageLengthCm) ||
      Number(product.packageLengthCm) <= 0 ||
      !Number.isFinite(product.packageWidthCm) ||
      Number(product.packageWidthCm) <= 0 ||
      !Number.isFinite(product.packageHeightCm) ||
      Number(product.packageHeightCm) <= 0
    ) {
      throw new BadRequestException(
        'Add the parcel weight, StackAPI courier category, and parcel length, width and height before setting this product Live',
      );
    }
  }

  async setSalesClosed(
    id: string,
    salesClosed: boolean,
    currentUser: { userId: string; accountType: string },
  ) {
    const product = await this.getOwnedProduct(id, currentUser);
    const updated = await this.productsRepository.update(id, { salesClosed } as any);
    if (!updated) throw new NotFoundException('Product not found');
    const populated = await this.productsRepository.findByIdWithSeller(id);
    return this.toManageCard((populated ?? product) as any);
  }

  async setDeactivated(
    id: string,
    isDeactivated: boolean,
    currentUser: { userId: string; accountType: string },
  ) {
    const product = await this.getOwnedProduct(id, currentUser);
    const isActive =
      (product as any).publicationStatus === 'live' &&
      !isDeactivated &&
      product.moderationStatus === 'approved';
    const updated = await this.productsRepository.update(id, {
      isDeactivated,
      isActive,
      ...(isDeactivated ? { recommendedAt: null } : {}),
    } as any);
    if (!updated) throw new NotFoundException('Product not found');
    const populated = await this.productsRepository.findByIdWithSeller(id);
    return this.toManageCard((populated ?? updated) as any);
  }

  async setRecommended(
    id: string,
    recommended: boolean,
    currentUser: { userId: string; accountType: string },
  ) {
    const product = await this.getOwnedProduct(id, currentUser);
    if (
      recommended &&
      ((product as any).publicationStatus !== 'live' ||
        !product.isActive ||
        (product as any).isDeactivated ||
        product.moderationStatus !== 'approved')
    ) {
      throw new BadRequestException('Only your Live products can be recommended');
    }
    if (recommended) {
      const sellerId = (product.seller as any)._id.toString();
      await this.productsRepository.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM stores WHERE id = ${sellerId} FOR UPDATE`;
        const current = await tx.product.findUnique({
          where: { id },
          select: {
            recommendedAt: true,
            publicationStatus: true,
            isActive: true,
            isDeactivated: true,
            moderationStatus: true,
          },
        });
        if (
          !current ||
          current.publicationStatus !== 'live' ||
          !current.isActive ||
          current.isDeactivated ||
          current.moderationStatus !== 'approved'
        ) {
          throw new BadRequestException('Only your Live products can be recommended');
        }
        const count = await tx.product.count({
          where: { sellerId, recommendedAt: { not: null }, deletedAt: null },
        });
        if (!current?.recommendedAt && count >= 4) {
          throw new BadRequestException('You can recommend up to four products');
        }
        await tx.product.update({ where: { id }, data: { recommendedAt: new Date() } });
      });
    } else {
      await this.productsRepository.prisma.product.updateMany({
        where: { id, sellerId: (product.seller as any)._id.toString() },
        data: { recommendedAt: null },
      });
    }
    const updated = await this.productsRepository.findByIdWithSeller(id);
    return this.toManageCard((updated ?? product) as any);
  }

  async duplicateProduct(id: string, currentUser: { userId: string; accountType: string }) {
    const product = await this.getOwnedProduct(id, currentUser);
    const makeSku = () => `COPY-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    const variants = product.variants.map((variant) => ({
      id: randomUUID(),
      sku: makeSku(),
      attributes: variant.attributes,
      priceAdjustmentAmount: Number(
        variant.priceAdjustment?.amount ??
          Number(variant.price?.amount ?? 0) - Number(product.price?.amount ?? 0),
      ),
      stockQty: 0,
      images: variant.images,
    }));
    const defaultVariantIndex = product.variants.findIndex(
      (variant) => variant.id === product.defaultVariantId,
    );
    return this.createMyProduct(
      {
        name: `${product.name} (copy)`,
        brand: product.brand ?? undefined,
        sku: makeSku(),
        categoryId: (product as any).category ?? undefined,
        subCategoryId: (product as any).subCategory ?? undefined,
        priceAmount: Number(product.price?.amount ?? 0),
        originalPriceAmount: product.originalPrice?.amount,
        thumbnailUrl: product.thumbnailUrl ?? undefined,
        gallery: product.gallery as any,
        variantAxes: product.variantAxes as any,
        variants: variants as any,
        defaultVariantId:
          defaultVariantIndex >= 0 ? variants[defaultVariantIndex]?.id : variants[0]?.id,
        descriptionHtml: product.descriptionHtml ?? undefined,
        tabs: product.tabs as any,
        specifications: product.specifications as any,
        breadcrumbs: product.breadcrumbs as any,
        badge: product.badge ?? undefined,
        sections: product.sections,
        inventoryStatus: 'out_of_stock',
        stockQty: 0,
        deliveryMethod: (product as any).deliveryMethod ?? undefined,
        shippingWeightGrams: (product as any).shippingWeightGrams ?? undefined,
        logisticsCategoryId: (product as any).logisticsCategoryId ?? undefined,
        packageLengthCm: (product as any).packageLengthCm ?? undefined,
        packageWidthCm: (product as any).packageWidthCm ?? undefined,
        packageHeightCm: (product as any).packageHeightCm ?? undefined,
        returnPolicy: product.returnPolicy ?? undefined,
      } as any,
      currentUser,
    );
  }

  async approveProduct(id: string) {
    const product = await this.assertProductExists(id);

    const updated = await this.productsRepository.update(id, {
      isActive: (product as any).publicationStatus === 'live' && !(product as any).isDeactivated,
      moderationStatus: 'approved',
      moderationReason: null,
      moderatedAt: new Date(),
    } as any);
    if (!updated) {
      throw new NotFoundException('Product not found');
    }

    const populated = await this.productsRepository.findByIdWithSeller(id);
    return populated ? this.toManageCard(populated) : this.toManageCard(updated as any);
  }

  async rejectProduct(id: string, reason?: string | null) {
    await this.assertProductExists(id);

    const updated = await this.productsRepository.update(id, {
      isActive: false,
      recommendedAt: null,
      moderationStatus: 'rejected',
      moderationReason: reason?.trim() ? reason.trim() : null,
      moderatedAt: new Date(),
    } as any);
    if (!updated) {
      throw new NotFoundException('Product not found');
    }

    const populated = await this.productsRepository.findByIdWithSeller(id);
    return populated ? this.toManageCard(populated) : this.toManageCard(updated as any);
  }

  async featureProduct(id: string, featured = true, badge?: string | null) {
    const product = await this.productsRepository.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const sections = new Set(product.sections ?? []);
    if (featured) {
      sections.add('featured');
    } else {
      sections.delete('featured');
    }

    const updates: Record<string, unknown> = {
      sections: [...sections],
    };

    if (featured) {
      updates.badge = badge?.trim() ? badge.trim() : (product.badge ?? 'Featured');
    } else if (badge !== undefined) {
      updates.badge = badge;
    } else if (product.badge === 'Featured') {
      updates.badge = null;
    }

    const updated = await this.productsRepository.update(id, updates as any);
    if (!updated) {
      throw new NotFoundException('Product not found');
    }

    const populated = await this.productsRepository.findByIdWithSeller(id);
    return populated ? this.toManageCard(populated) : this.toManageCard(updated as any);
  }

  private async getSellerByOwner(ownerId: string) {
    const seller = await this.productsRepository.prisma.seller.findFirst({
      where: { ownerId, deletedAt: null },
    });
    if (!seller) {
      throw new NotFoundException('Seller profile not found');
    }

    return seller;
  }

  private async getOwnedProduct(
    id: string,
    currentUser: { userId: string; accountType: string },
  ): Promise<Product> {
    const product = await this.productsRepository.findByIdWithSellerOwner(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (currentUser.accountType !== AccountType.ADMIN) {
      const sellerOwner = (product.seller as any)?.owner?.toString();
      if (sellerOwner !== currentUser.userId) {
        throw new ForbiddenException('You do not own this product');
      }
    }

    return product;
  }

  private async assertProductExists(id: string) {
    const product = await this.productsRepository.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  private toDetail(product: Product, variantId?: string) {
    const id = (product as unknown as { _id: { toString(): string } })._id.toString();
    const seller = product.seller as unknown as {
      _id: { toString(): string };
      name: string;
      slug: string;
      logoUrl: string | null;
      isVerified: boolean;
      responseRatePercent: number;
      averageRating: number;
      joinedYear: number;
      reviewCount: number;
      followerCount: number;
      location: string | null;
      deliveryTimeRange: string | null;
    } | null;
    const selectedVariantId = this.resolveSelectedVariantId(product, variantId);
    const selectedVariant =
      product.variants.find((variant) => variant.id === selectedVariantId) ?? null;

    return {
      id,
      slug: product.slug,
      sku: product.sku,
      productCode: product.sku,
      name: product.name,
      brand: product.brand,
      breadcrumbs: product.breadcrumbs,
      rating: product.rating,
      reviewCount: product.reviewCount,
      price: product.price,
      originalPrice: product.originalPrice,
      discountPercent: product.discountPercent,
      savings: product.savings,
      gallery: product.gallery,
      variantAxes: product.variantAxes,
      variants: product.variants,
      defaultVariantId: product.defaultVariantId,
      selectedVariantId,
      selectedVariant,
      inventoryStatus: product.inventoryStatus,
      badge: product.badge,
      descriptionHtml: product.descriptionHtml,
      tabs: product.tabs,
      specifications: product.specifications,
      returnPolicy: product.returnPolicy,
      seller: seller
        ? {
            id: seller._id.toString(),
            name: seller.name,
            logoUrl: seller.logoUrl ?? null,
            isVerified: seller.isVerified,
            responseRatePercent: seller.responseRatePercent,
            rating: seller.averageRating,
            joinedYear: seller.joinedYear,
            reviewCount: seller.reviewCount,
            followerCount: seller.followerCount,
            location: seller.location ?? null,
            deliveryTimeRange: seller.deliveryTimeRange ?? null,
            sellerUrl: `/sellers/${seller.slug}`,
          }
        : null,
    };
  }

  private resolveSelectedVariantId(product: Product, preferredVariantId?: string): string | null {
    if (
      preferredVariantId &&
      product.variants.some((variant) => variant.id === preferredVariantId)
    ) {
      return preferredVariantId;
    }

    if (
      product.defaultVariantId &&
      product.variants.some((variant) => variant.id === product.defaultVariantId)
    ) {
      return product.defaultVariantId;
    }

    return product.variants[0]?.id ?? null;
  }
}
