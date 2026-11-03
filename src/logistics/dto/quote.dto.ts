import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  Min,
  IsEmail,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StackApiLogisticsAddressDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsEmail() email!: string;
  @IsString() @IsNotEmpty() phone!: string;
  @IsString() @IsNotEmpty() address!: string;
  @IsString() @IsNotEmpty() city!: string;
  @IsString() @IsNotEmpty() state!: string;
}

export class StackApiParcelItemDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsNumber() @Min(0.001) weight_kg!: number;
  @IsNumber() @Min(0) value!: number;
  @IsInt() @Min(1) quantity!: number;
}

export class LogisticsQuoteDto {
  @ValidateNested()
  @Type(() => StackApiLogisticsAddressDto)
  sender!: StackApiLogisticsAddressDto;

  @ValidateNested()
  @Type(() => StackApiLogisticsAddressDto)
  receiver!: StackApiLogisticsAddressDto;

  @IsInt()
  @Min(1)
  categoryId!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StackApiParcelItemDto)
  items!: StackApiParcelItemDto[];

  @IsNumber()
  @Min(0.1)
  lengthCm!: number;

  @IsNumber()
  @Min(0.1)
  widthCm!: number;

  @IsNumber()
  @Min(0.1)
  heightCm!: number;

  @IsOptional()
  @IsString()
  pickupDate?: string;
}

export class CoverageCheckDto {
  @IsString()
  city!: string;

  @IsString()
  address!: string;
}

export class BookCourierDto {
  @IsString()
  orderId!: string;

  @IsString()
  orderRef!: string;

  @IsString()
  @IsNotEmpty()
  groupKey!: string;

  @IsString()
  @IsNotEmpty()
  quoteId!: string;

  @IsString()
  @IsNotEmpty()
  courierId!: string;

  @IsString()
  @IsNotEmpty()
  serviceCode!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  quotedFeeKobo?: number;

  @IsOptional()
  @IsString()
  preferredProvider?: string;
}

export class PodUploadDto {
  @IsString()
  bookingId!: string;

  @IsString()
  type!: string;

  @IsOptional()
  @IsString()
  url?: string;
}

export class PickupActionDto {
  @IsString()
  orderId!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
