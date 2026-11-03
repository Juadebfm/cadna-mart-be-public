import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RejectProductDto {
  @ApiPropertyOptional({
    description: 'Optional moderation reason saved with the rejected product',
  })
  @IsString()
  @IsOptional()
  reason?: string;
}
