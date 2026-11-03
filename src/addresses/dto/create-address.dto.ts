import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAddressDto {
  @ApiPropertyOptional({ example: 'Home' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty()
  recipientName!: string;

  @ApiProperty({ example: '+2348012345678' })
  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;

  @ApiProperty({ example: '12 Allen Avenue' })
  @IsString()
  @IsNotEmpty()
  street1!: string;

  @ApiPropertyOptional({ example: 'Flat 3B' })
  @IsOptional()
  @IsString()
  street2?: string;

  @ApiProperty({ example: 'Ikeja' })
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiPropertyOptional({
    example: 'Ikeja',
    description: 'Local Government Area used for delivery-zone pricing',
  })
  @IsOptional()
  @IsString()
  lga?: string;

  @ApiProperty({ example: 'Lagos' })
  @IsString()
  @IsNotEmpty()
  state!: string;

  @ApiPropertyOptional({ example: 'Nigeria', default: 'Nigeria' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: '100001' })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional({ example: 'Near the central market' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
