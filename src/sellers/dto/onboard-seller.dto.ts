import { IsEmail, IsString, IsNotEmpty, IsOptional, IsBoolean, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OnboardSellerDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @MinLength(8) password!: string;
  @ApiProperty() @IsString() @IsNotEmpty() firstName!: string;
  @ApiProperty() @IsString() @IsNotEmpty() lastName!: string;
  @ApiProperty() @IsString() @IsNotEmpty() businessName!: string;
  @ApiProperty() @IsString() @IsNotEmpty() businessAddress!: string;
  @ApiProperty({ example: 'sole_proprietorship' }) @IsString() @IsNotEmpty() businessType!: string;
  @ApiPropertyOptional() @IsString() @IsOptional() phoneNumber?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() businessRegistrationNumber?: string;
  @ApiProperty({ default: true }) @IsBoolean() termsAccepted!: boolean;
}
