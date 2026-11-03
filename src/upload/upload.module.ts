import { Module } from '@nestjs/common';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';
import { MediaController } from './media.controller';

@Module({
  controllers: [UploadController, MediaController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
