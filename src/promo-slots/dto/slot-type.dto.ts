import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { SlotPlacement } from '../schemas/slot-type.schema';

export class CreateSlotTypeDto {
  @IsString()
  name!: string;

  @IsEnum(SlotPlacement)
  placement!: SlotPlacement;

  @IsInt()
  @Min(1)
  maxItems!: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateSlotTypeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxItems?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  description?: string;
}
