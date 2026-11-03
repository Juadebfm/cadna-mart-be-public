import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class MarketingConsentDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  optIn!: boolean;
}

export class DataDeleteRequestDto {
  @ApiPropertyOptional({ example: 'Closing account' })
  @IsOptional()
  @IsString()
  reason?: string;
}
