import { IsNotEmpty, IsString, IsOptional, IsEnum, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BusinessType } from '@sellers/schemas/seller-profile.schema';

export class RegisterSellerPasswordDto {
  @ApiProperty({ example: 'session-uuid-here' })
  @IsNotEmpty()
  @IsString()
  sessionId!: string;

  @ApiProperty({ example: 'StrongP@ssw0rd1', minLength: 8 })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'StrongP@ssw0rd1' })
  @IsNotEmpty()
  @IsString()
  confirmPassword!: string;

  // Business details (passed again since session doesn't store them)
  @ApiProperty({ example: 'Steppers Store NG' })
  @IsNotEmpty()
  @IsString()
  businessName!: string;

  @ApiPropertyOptional({ example: 'RC-1234567' })
  @IsOptional()
  @IsString()
  businessRegistrationNumber?: string;

  @ApiProperty({ example: 'Shop 15, Balogun Market, Lagos Island' })
  @IsNotEmpty()
  @IsString()
  businessAddress!: string;

  @ApiProperty({ enum: BusinessType, example: BusinessType.SOLE_PROPRIETOR })
  @IsNotEmpty()
  @IsEnum(BusinessType)
  businessType!: BusinessType;

  // Bank details intentionally NOT accepted here. The seller submits them
  // via POST /sellers/me/banking after login. See seller-profile schema +
  // /sellers controller. Keeps unauth endpoints free of bank PII.
}
