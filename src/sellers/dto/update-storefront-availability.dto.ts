import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateStorefrontAvailabilityDto {
  @ApiProperty({ description: 'Make your approved storefront visible or take it offline' })
  @IsBoolean()
  isActive!: boolean;
}
