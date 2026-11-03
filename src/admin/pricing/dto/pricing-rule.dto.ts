import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsIn,
  Min,
  Max,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import {
  PricingRuleType,
  PricingRuleScope,
  PricingRuleValueType,
} from '../schemas/pricing-rule.schema';

export class CreatePricingRuleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(PricingRuleType)
  type!: PricingRuleType;

  @IsEnum(PricingRuleScope)
  @IsOptional()
  scope?: PricingRuleScope;

  @IsOptional()
  @IsString()
  scopeValue?: string;

  @IsNumber()
  @Min(0)
  value!: number;

  @IsEnum(PricingRuleValueType)
  @IsOptional()
  valueType?: PricingRuleValueType;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdatePricingRuleDto extends PartialType(CreatePricingRuleDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateFeesDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  vatPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  standardDeliveryFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  expressDeliveryFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  platformFeePercent?: number;
}

export class SimulateDto {
  @IsNumber()
  @Min(0)
  cartSubtotal!: number;

  @IsOptional()
  @IsIn(['standard', 'express', 'pickup'])
  deliveryMode?: string;
}
