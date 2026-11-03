import { IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CategoryQueryDto {
  @ApiPropertyOptional({ description: 'Return categories as a tree', default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  tree: boolean = false;

  @ApiPropertyOptional({ description: 'Include product counts', default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeCounts: boolean = false;
}
