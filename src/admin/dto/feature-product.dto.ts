import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class FeatureProductDto {
  @ApiPropertyOptional({
    description: 'Set to false to remove the product from the featured rail',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  featured?: boolean;

  @ApiPropertyOptional({
    description: 'Optional badge override. Defaults to "Featured" when featuring a product.',
  })
  @IsString()
  @IsOptional()
  badge?: string | null;
}
