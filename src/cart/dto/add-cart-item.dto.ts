import { IsNotEmpty, IsString, IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddCartItemDto {
  @ApiProperty({ example: 'product-id' })
  @IsNotEmpty()
  @IsString()
  productId!: string;

  @ApiPropertyOptional({ example: 'variant-id' })
  @IsOptional()
  @IsString()
  variantId?: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class UpdateCartItemDto {
  @ApiProperty({ example: 2, minimum: 1 })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  quantity!: number;
}
