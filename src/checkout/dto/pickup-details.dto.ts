import { IsDateString, IsOptional, IsString } from 'class-validator';

export class PickupDetailsDto {
  @IsString()
  contactName!: string;

  @IsString()
  contactPhone!: string;

  @IsOptional()
  @IsString()
  vehicleType?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
