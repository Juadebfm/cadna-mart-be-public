import { IsString, IsNumber, IsOptional, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  comment?: string;

  @ApiPropertyOptional({
    description: 'Cloudinary publicId from an image uploaded to the reviews folder',
  })
  @IsString()
  @IsOptional()
  @MaxLength(300)
  imagePublicId?: string;
}
