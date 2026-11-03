import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { UploadFolder } from '../upload.service';

export class RequestPresignedUploadDto {
  @ApiPropertyOptional({
    enum: ['products', 'stores', 'categories', 'profiles', 'general'],
    default: 'general',
    description:
      'Support evidence must use POST /media/upload to enforce image type and size limits.',
  })
  @IsString()
  @IsOptional()
  @IsIn(['products', 'stores', 'categories', 'profiles', 'general'])
  folder?: UploadFolder;
}
