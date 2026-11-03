import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { SellerDocumentType } from '../schemas/seller-profile.schema';

export class RequestSellerApplicationInformationDto {
  @ApiProperty({ example: 'Please upload a clearer CAC certificate.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;

  @ApiPropertyOptional({ enum: SellerDocumentType, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(SellerDocumentType, { each: true })
  requestedDocumentTypes?: SellerDocumentType[];
}

export class RejectSellerApplicationDto {
  @ApiProperty({ example: 'The submitted registration details do not match CAC records.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
