import { IsBoolean, IsInt, Matches, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateDurationTierDto {
  @Matches(/^[a-f\d]{24}$/i)
  slotTypeId!: string;

  @IsString()
  label!: string;

  @IsInt()
  @Min(1)
  durationHours!: number;

  @IsNumber()
  @Min(0)
  priceNGN!: number;
}

export class UpdateDurationTierDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceNGN?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
