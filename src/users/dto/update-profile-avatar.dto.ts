import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateProfileAvatarDto {
  @ApiProperty({ description: 'Cloudinary public ID returned by POST /media/upload' })
  @IsString()
  @IsNotEmpty()
  publicId!: string;
}
