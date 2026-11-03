import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiProperty() @IsString() @IsNotEmpty() slug!: string;
  @ApiPropertyOptional() @IsString() @IsOptional() iconUrl?: string;
  @ApiPropertyOptional({ description: 'Parent category ID (null for top-level)' })
  @IsString()
  @IsOptional()
  parentId?: string;
  @ApiPropertyOptional() @IsNumber() @IsOptional() @Min(0) order?: number;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;
}
