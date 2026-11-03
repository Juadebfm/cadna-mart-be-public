import { PartialType } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export const CONFIGURABLE_DELIVERY_METHODS = ['seller_owned_courier'] as const;

export class CreateDeliveryZoneDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  state!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  lgaNames!: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDeliveryZoneDto extends PartialType(CreateDeliveryZoneDto) {}

export class CreateDeliveryRateDto {
  @IsIn(CONFIGURABLE_DELIVERY_METHODS)
  method!: (typeof CONFIGURABLE_DELIVERY_METHODS)[number];

  @IsInt()
  @Min(0)
  minWeightGrams!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxWeightGrams?: number | null;

  @IsInt()
  @Min(0)
  amountKobo!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDeliveryRateDto extends PartialType(CreateDeliveryRateDto) {}
