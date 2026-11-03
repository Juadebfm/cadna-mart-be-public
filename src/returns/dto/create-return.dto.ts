import { IsEnum, IsInt, Matches, IsOptional, IsString, Min } from 'class-validator';
import { ReturnReason, ReturnRequestType } from '../schemas/return-request.schema';

export class CreateReturnDto {
  @Matches(/^[a-f\d]{24}$/i)
  orderId!: string;

  @IsEnum(ReturnRequestType)
  requestType!: ReturnRequestType;

  // Product identifiers are used only for item returns. Names, sellers, and
  // prices are always taken from the immutable order snapshot.
  @IsOptional()
  @IsString()
  orderItemProductId?: string;

  @IsOptional()
  @IsString()
  orderItemVariantId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsEnum(ReturnReason)
  reason!: ReturnReason;

  @IsOptional()
  @IsString()
  description?: string;
}
