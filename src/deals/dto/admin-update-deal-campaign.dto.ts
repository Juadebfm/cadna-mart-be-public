import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsDateString, Min } from 'class-validator';
import { CreateDealCampaignDto } from './create-deal-campaign.dto';
import { DealCampaignStatus, DealPaymentStatus } from '../schemas/deal-campaign.schema';

export class AdminUpdateDealCampaignDto extends PartialType(CreateDealCampaignDto) {
  @IsOptional()
  @IsEnum(DealCampaignStatus)
  status?: DealCampaignStatus;

  @IsOptional()
  @IsEnum(DealPaymentStatus)
  paymentStatus?: DealPaymentStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  feeAmount?: number;

  @IsOptional()
  @IsDateString()
  paidAt?: string;
}
