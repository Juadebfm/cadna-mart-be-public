import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, Matches, IsOptional, Max, Min } from 'class-validator';
import { DealCampaignStatus, DealPaymentStatus } from '../schemas/deal-campaign.schema';

export class DealCampaignQueryDto {
  @ApiPropertyOptional({ enum: DealCampaignStatus })
  @IsOptional()
  @IsEnum(DealCampaignStatus)
  status?: DealCampaignStatus;

  @ApiPropertyOptional({ enum: DealPaymentStatus })
  @IsOptional()
  @IsEnum(DealPaymentStatus)
  paymentStatus?: DealPaymentStatus;

  @ApiPropertyOptional({ description: 'Filter by seller ID (admin only)' })
  @IsOptional()
  @Matches(/^[a-f\d]{24}$/i)
  sellerId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
