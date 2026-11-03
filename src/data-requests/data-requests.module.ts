import { Module } from '@nestjs/common';
import { PrismaModule } from '@database/prisma.module';
import { DataRequestsService } from './data-requests.service';
import { UploadModule } from '@upload/upload.module';
import { EmailModule } from '@email/email.module';
import { StackApiSmsService } from '@notifications/stackapi-sms.service';

@Module({
  imports: [PrismaModule, UploadModule, EmailModule],
  providers: [DataRequestsService, StackApiSmsService],
  exports: [DataRequestsService],
})
export class DataRequestsModule {}
