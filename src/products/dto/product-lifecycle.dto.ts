import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn } from 'class-validator';

export class UpdateProductPublicationDto {
  @ApiProperty({ enum: ['draft', 'live'] })
  @IsIn(['draft', 'live'])
  status!: 'draft' | 'live';
}

export class UpdateProductSalesDto {
  @ApiProperty({ description: 'True keeps the listing visible but prevents purchases' })
  @IsBoolean()
  closed!: boolean;
}

export class UpdateProductDeactivationDto {
  @ApiProperty({ description: 'True hides the listing from buyers' })
  @IsBoolean()
  deactivated!: boolean;
}

export class UpdateProductRecommendationDto {
  @ApiProperty({ description: 'A seller can recommend up to four Live products' })
  @IsBoolean()
  recommended!: boolean;
}
