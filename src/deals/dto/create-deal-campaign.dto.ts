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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDealCampaignDto {
  @ApiProperty({ description: 'Campaign title', example: 'Friday Mega Flash Sales' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  @ApiProperty({
    description: 'Up to 10 seller-owned product IDs to feature in deals',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @Matches(/^[a-f\d]{24}$/i, { each: true })
  selectedProductIds!: string[];

  @ApiPropertyOptional({ description: 'Optional campaign start datetime (ISO-8601)' })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({ description: 'Optional campaign end datetime (ISO-8601)' })
  @IsOptional()
  @IsDateString()
  endsAt?: string;
}
