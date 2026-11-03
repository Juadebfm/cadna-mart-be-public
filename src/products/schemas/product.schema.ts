import { BaseSchema } from '@shared/base/base.schema';
class Money {
  amount!: number;
  currency!: string;
  formatted!: string;
}
class GalleryImage {
  id!: string;
  url!: string;
  alt!: string | null;
}
class VariantOption {
  id!: string;
  label!: string;
  swatchHex!: string | null;
}
class VariantAxis {
  name!: string;
  displayName!: string;
  options!: VariantOption[];
}
class ProductVariant {
  id!: string;
  sku!: string;
  attributes!: Record<string, string>;
  price!: Money;
  priceAdjustment!: Money;
  stockQty!: number;
  isInStock!: boolean;
  images!: string[];
}
class ProductTab {
  label!: string;
  contentHtml!: string;
}
class Specification {
  name!: string;
  value!: string;
}
class Breadcrumb {
  label!: string;
  url!: string | null;
}
export class Product extends BaseSchema {
  name!: string;
  slug!: string;
  sku!: string | null;
  brand!: string | null;
  thumbnailUrl!: string | null;
  price!: Money;
  originalPrice!: Money | null;
  discountPercent!: number;
  savings!: Money | null;
  gallery!: GalleryImage[];
  variantAxes!: VariantAxis[];
  variants!: ProductVariant[];
  stockQty!: number;
  defaultVariantId!: string | null;
  descriptionHtml!: string | null;
  tabs!: ProductTab[];
  specifications!: Specification[];
  breadcrumbs!: Breadcrumb[];
  rating!: number;
  reviewCount!: number;
  inventoryStatus!: string;
  publicationStatus!: string;
  salesClosed!: boolean;
  isDeactivated!: boolean;
  deliveryMethod!: string | null;
  shippingWeightGrams!: number | null;
  logisticsCategoryId!: number | null;
  packageLengthCm!: number | null;
  packageWidthCm!: number | null;
  packageHeightCm!: number | null;
  recommendedAt!: Date | null;
  badge!: string | null;
  category!: string | null;
  subCategory!: string | null;
  seller!: string;
  returnPolicy!: {
    eligible: boolean;
    returnWindow: number;
    conditions: string | null;
  } | null;
  sections!: string[];
  isActive!: boolean;
  moderationStatus!: string;
  moderationReason!: string | null;
  moderatedAt!: Date | null;
  salesCount!: number;
}
