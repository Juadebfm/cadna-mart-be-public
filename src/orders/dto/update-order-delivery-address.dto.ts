import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateOrderDeliveryAddressDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  recipientName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  street1!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  street2?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiProperty({ description: 'Local Government Area used for delivery-zone pricing' })
  @IsString()
  @IsNotEmpty()
  lga!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  state!: string;

  @ApiPropertyOptional({ default: 'Nigeria' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  postalCode?: string;
}
