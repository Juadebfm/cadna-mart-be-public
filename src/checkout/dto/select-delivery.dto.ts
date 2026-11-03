import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class DeliverySelectionDto {
  @IsString() @IsNotEmpty() groupKey!: string;
  @IsString() @IsNotEmpty() quoteId!: string;
  @IsString() @IsNotEmpty() courierId!: string;
  @IsString() @IsNotEmpty() serviceCode!: string;
}

export class SelectDeliveryDto {
  // Kept optional for older callers. Checkout derives delivery methods from
  // the products and applies CADNA's configured rate for each seller group.
  @IsOptional()
  @IsString()
  mode?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliverySelectionDto)
  selections?: DeliverySelectionDto[];
}
