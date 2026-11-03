import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ProductImageInputDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  url!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsString()
  @IsOptional()
  alt?: string | null;
}

export class AttachProductImagesDto {
  @ApiProperty({ type: [ProductImageInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageInputDto)
  images!: ProductImageInputDto[];
}
