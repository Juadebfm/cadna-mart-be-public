import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveReviewReportDto {
  @ApiProperty({ enum: ['leave_visible', 'hide_review'] })
  @IsIn(['leave_visible', 'hide_review'])
  action!: 'leave_visible' | 'hide_review';

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
