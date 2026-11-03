import { IsMongoId, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CommitProductImportDto {
  @ApiProperty({
    description: 'Preview ID returned by POST /sellers/me/products/bulk-upload/preview',
  })
  @IsString()
  @IsMongoId()
  previewId!: string;
}
