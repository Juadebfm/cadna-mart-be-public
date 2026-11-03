import { IsIn, IsOptional, IsString } from 'class-validator';

export class SellerOrderActionDto {
  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  trackingNumber?: string;
}

export class SellerReturnDecisionDto {
  @IsIn(['approve', 'reject'])
  @IsString()
  decision!: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  note?: string;
}
