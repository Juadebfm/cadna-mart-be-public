import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { BusinessType, SellerApplicantType } from '../schemas/seller-profile.schema';

export class SaveSellerApplicationDto {
  @ApiProperty({ enum: SellerApplicantType })
  @IsEnum(SellerApplicantType)
  applicantType!: SellerApplicantType;

  @ApiProperty({ example: 'Cadna Home Store' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  businessName!: string;

  @ApiPropertyOptional({ example: 'RC1234567' })
  @ValidateIf(
    (dto: SaveSellerApplicationDto) =>
      dto.applicantType === SellerApplicantType.REGISTERED_BUSINESS,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  businessRegistrationNumber?: string;

  @ApiProperty({ example: 'Ikeja, Lagos' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  businessAddress!: string;

  @ApiProperty({ enum: BusinessType })
  @IsEnum(BusinessType)
  businessType!: BusinessType;
}
