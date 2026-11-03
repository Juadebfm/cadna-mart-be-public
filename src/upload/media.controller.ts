import {
  Controller,
  Delete,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  Body,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { UploadFolder, UploadService } from './upload.service';
import { RequestPresignedUploadDto } from './dto/request-presigned-upload.dto';

const ALLOWED_FOLDERS: UploadFolder[] = [
  'products',
  'stores',
  'categories',
  'profiles',
  'reviews',
  'general',
];

@ApiTags('Media')
@ApiBearerAuth()
@AccountTypes(AccountType.BUYER, AccountType.SELLER, AccountType.ADMIN)
@Controller('media')
export class MediaController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Upload an image to Cloudinary through the API' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async upload(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /^image\/(jpeg|jpg|png|webp|gif)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Query('folder') folder: string | undefined,
    @CurrentUser('userId') userId: string,
  ) {
    const safeFolder: UploadFolder = ALLOWED_FOLDERS.includes(folder as UploadFolder)
      ? (folder as UploadFolder)
      : 'general';
    return this.uploadService.uploadFile(file, safeFolder, userId);
  }

  @Post('upload/presigned')
  @ApiOperation({
    summary:
      'Create signed Cloudinary upload parameters for direct client upload. Use the returned media id for DELETE /media/{id} by base64url-encoding the resulting publicId.',
  })
  async createPresignedUpload(
    @Body() dto: RequestPresignedUploadDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.uploadService.createPresignedUpload(dto.folder ?? 'general', userId);
  }

  @Delete(':encodedPublicId')
  @ApiOperation({
    summary: 'Delete a media asset by passing its base64url-encoded Cloudinary publicId',
  })
  async deleteMedia(
    @Param('encodedPublicId') encodedPublicId: string,
    @CurrentUser() user: { userId: string; accountType: string },
  ) {
    return this.uploadService.deleteOwnedFile(encodedPublicId, user);
  }
}
