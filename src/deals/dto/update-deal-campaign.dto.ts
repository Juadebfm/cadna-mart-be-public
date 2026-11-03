import {
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  Matches,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateDealCampaignDto {
  @ApiPropertyOptional({ description: 'Campaign title', example: 'Weekend Flash Sales' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({
    description: 'Up to 10 seller-owned product IDs to feature in deals',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @Matches(/^[a-f\d]{24}$/i, { each: true })
  selectedProductIds?: string[];

  @ApiPropertyOptional({ description: 'Optional campaign start datetime (ISO-8601)' })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({ description: 'Optional campaign end datetime (ISO-8601)' })
  @IsOptional()
  @IsDateString()
  endsAt?: string;
}
