import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Query,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { UploadService, UploadFolder } from './upload.service';

const ALLOWED_FOLDERS: UploadFolder[] = ['products', 'stores', 'categories', 'reviews', 'general'];

@ApiTags('Upload')
@ApiBearerAuth()
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @AccountTypes(AccountType.SELLER, AccountType.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Upload an image to Cloudinary (Seller or Admin)' })
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
    @Query('folder') folder?: string,
    @CurrentUser('userId') userId?: string,
  ) {
    const safeFolder: UploadFolder = ALLOWED_FOLDERS.includes(folder as UploadFolder)
      ? (folder as UploadFolder)
      : 'general';
    return this.uploadService.uploadFile(file, safeFolder, userId);
  }
}
