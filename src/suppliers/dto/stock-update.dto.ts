import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class StockUpdateDto {
  @IsInt()
  @Min(0)
  stock!: number;

  @IsOptional()
  @IsString()
  variantId?: string;
}

export class SupplierOrderActionDto {
  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  trackingNumber?: string;
}
