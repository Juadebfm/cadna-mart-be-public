import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum ReviewModerationAction {
  APPROVE = 'approve',
  HIDE = 'hide',
}

export class ModerateReviewDto {
  @ApiProperty({ enum: ReviewModerationAction })
  @IsEnum(ReviewModerationAction)
  action!: ReviewModerationAction;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  reason?: string;
}
