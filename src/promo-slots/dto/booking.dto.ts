import { IsInt, Matches, IsOptional, IsString, Min } from 'class-validator';

export class CreateBookingDto {
  @Matches(/^[a-f\d]{24}$/i)
  slotId!: string;

  @Matches(/^[a-f\d]{24}$/i)
  durationTierId!: string;

  @Matches(/^[a-f\d]{24}$/i)
  productId!: string;
}

export class GenerateSlotsDto {
  @Matches(/^[a-f\d]{24}$/i)
  slotTypeId!: string;

  @IsString()
  startDate!: string;

  @IsString()
  endDate!: string;

  @IsInt()
  @Min(1)
  capacity!: number;
}

export class UpdateCapacityDto {
  @Matches(/^[a-f\d]{24}$/i)
  slotTypeId!: string;

  @IsInt()
  @Min(1)
  capacity!: number;
}

export class SuspendBookingDto {
  @IsString()
  reason!: string;
}

export class RefundBookingDto {
  @IsOptional()
  @IsString()
  note?: string;
}
