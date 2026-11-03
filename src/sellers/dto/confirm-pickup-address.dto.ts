import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ConfirmPickupAddressDto {
  @ApiProperty() @IsString() @IsNotEmpty() recipientName!: string;
  @ApiProperty() @IsString() @IsNotEmpty() phoneNumber!: string;
  @ApiProperty() @IsString() @IsNotEmpty() street1!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() street2?: string;
  @ApiProperty() @IsString() @IsNotEmpty() city!: string;
  @ApiProperty() @IsString() @IsNotEmpty() state!: string;
  @ApiPropertyOptional({ default: 'Nigeria' }) @IsOptional() @IsString() country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() postalCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;

  @ApiProperty({ description: 'Must be true to confirm courier pickup at this address' })
  @IsBoolean()
  @Equals(true)
  confirmed!: true;
}
