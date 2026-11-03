import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsArray,
  IsBoolean,
  Min,
  Max,
  ValidateNested,
  IsObject,
  IsInt,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GalleryImageDto {
  @ApiProperty() @IsString() @IsNotEmpty() id!: string;
  @ApiProperty() @IsString() @IsNotEmpty() url!: string;
  @ApiPropertyOptional() @IsString() @IsOptional() alt?: string;
}

export class VariantOptionDto {
  @ApiProperty() @IsString() @IsNotEmpty() id!: string;
  @ApiProperty() @IsString() @IsNotEmpty() label!: string;
  @ApiPropertyOptional({ nullable: true }) @IsString() @IsOptional() swatchHex?: string | null;
}

export class VariantAxisDto {
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiProperty() @IsString() @IsNotEmpty() displayName!: string;
  @ApiProperty({ type: [VariantOptionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantOptionDto)
  options!: VariantOptionDto[];
}

export class ProductVariantDto {
  @ApiProperty() @IsString() @IsNotEmpty() id!: string;
  @ApiProperty() @IsString() @IsNotEmpty() sku!: string;
  @ApiProperty() @IsObject() attributes!: Record<string, string>;
  @ApiPropertyOptional({ description: 'Variant price adjustment added to the base selling price' })
  @IsNumber()
  @IsOptional()
  priceAdjustmentAmount?: number;
  @ApiPropertyOptional({ deprecated: true, description: 'Legacy final variant price' })
  @IsNumber()
  @IsOptional()
  priceAmount?: number;
  @ApiPropertyOptional() @IsInt() @IsOptional() @Min(0) stockQty?: number;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isInStock?: boolean;
  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  images?: string[];
}

export class ProductTabDto {
  @ApiProperty() @IsString() @IsNotEmpty() label!: string;
  @ApiProperty() @IsString() @IsNotEmpty() contentHtml!: string;
}

export class SpecificationDto {
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiProperty() @IsString() @IsNotEmpty() value!: string;
}

export class BreadcrumbDto {
  @ApiProperty() @IsString() @IsNotEmpty() label!: string;
  @ApiPropertyOptional({ nullable: true }) @IsString() @IsOptional() url?: string | null;
}

export class CreateProductDto {
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiPropertyOptional() @IsString() @IsOptional() brand?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() sku?: string;

  @ApiProperty({ description: 'Seller ID this product belongs to' })
  @IsString()
  @IsNotEmpty()
  sellerId!: string;

  @ApiPropertyOptional() @IsString() @IsOptional() categoryId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() subCategoryId?: string;

  @ApiProperty({ description: 'Base selling price in NGN' })
  @IsNumber()
  @Min(0)
  priceAmount!: number;

  @ApiPropertyOptional({ description: 'Original/compare-at price (if on sale)' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  originalPriceAmount?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @ApiPropertyOptional() @IsString() @IsOptional() thumbnailUrl?: string;

  @ApiPropertyOptional({ type: [GalleryImageDto] })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => GalleryImageDto)
  gallery?: GalleryImageDto[];

  @ApiPropertyOptional({ type: [VariantAxisDto] })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => VariantAxisDto)
  variantAxes?: VariantAxisDto[];

  @ApiPropertyOptional({ type: [ProductVariantDto] })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  variants?: ProductVariantDto[];

  @ApiPropertyOptional() @IsString() @IsOptional() defaultVariantId?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() descriptionHtml?: string;

  @ApiPropertyOptional({ type: [ProductTabDto] })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProductTabDto)
  tabs?: ProductTabDto[];

  @ApiPropertyOptional({ type: [SpecificationDto] })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SpecificationDto)
  specifications?: SpecificationDto[];

  @ApiPropertyOptional({ type: [BreadcrumbDto] })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => BreadcrumbDto)
  breadcrumbs?: BreadcrumbDto[];

  @ApiPropertyOptional() @IsString() @IsOptional() badge?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  sections?: string[];

  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;

  @ApiPropertyOptional() @IsString() @IsOptional() inventoryStatus?: string;

  @ApiPropertyOptional({
    description: 'Available units for a product without variants',
    minimum: 0,
  })
  @IsInt()
  @IsOptional()
  @Min(0)
  stockQty?: number;

  @ApiPropertyOptional({ enum: ['cadna_logistics', 'seller_owned_courier', 'partner_courier'] })
  @IsIn(['cadna_logistics', 'seller_owned_courier', 'partner_courier'])
  @IsOptional()
  deliveryMethod?: 'cadna_logistics' | 'seller_owned_courier' | 'partner_courier';

  @ApiPropertyOptional({ description: 'Shipping weight in grams', minimum: 1 })
  @IsInt()
  @IsOptional()
  @Min(1)
  shippingWeightGrams?: number;

  @ApiPropertyOptional({
    description: 'StackAPI logistics category ID returned by GET /v1/logistics/categories',
    minimum: 1,
  })
  @IsInt()
  @IsOptional()
  @Min(1)
  logisticsCategoryId?: number;

  @ApiPropertyOptional({ description: 'Parcel length in centimetres', minimum: 0.1 })
  @IsNumber()
  @IsOptional()
  @Min(0.1)
  packageLengthCm?: number;

  @ApiPropertyOptional({ description: 'Parcel width in centimetres', minimum: 0.1 })
  @IsNumber()
  @IsOptional()
  @Min(0.1)
  packageWidthCm?: number;

  @ApiPropertyOptional({ description: 'Parcel height in centimetres', minimum: 0.1 })
  @IsNumber()
  @IsOptional()
  @Min(0.1)
  packageHeightCm?: number;

  @ApiPropertyOptional({ description: 'Return policy for this product' })
  @IsObject()
  @IsOptional()
  returnPolicy?: { eligible: boolean; returnWindow: number; conditions: string | null };
}
