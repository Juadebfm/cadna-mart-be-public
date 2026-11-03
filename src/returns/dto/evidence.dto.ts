import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddEvidenceDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: 5,
    description:
      'Public IDs of buyer-owned images uploaded to the support folder (JPEG, PNG, WebP, or GIF; maximum 5 MB each).',
  })
  publicIds!: string[];
}
