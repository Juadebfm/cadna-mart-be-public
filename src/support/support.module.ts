import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { AdminSupportController, SupportWebhooksController } from './admin-support.controller';
import { SupportService } from './support.service';
import { SupportRepository } from './support.repository';
import { UploadModule } from '@upload/upload.module';
import { SupportContactController } from './support-contact.controller';
import { EmailModule } from '@email/email.module';
import { SiteConfigModule } from '@site-config/site-config.module';
import { SupportGateway } from './support.gateway';
import { SupportOutboxPublisher } from './support-outbox.publisher';
import { AuthModule } from '@auth/auth.module';
import { UsersModule } from '@users/users.module';
import { NotificationsModule } from '@notifications/notifications.module';

@Module({
  imports: [
    UploadModule,
    EmailModule,
    SiteConfigModule,
    AuthModule,
    UsersModule,
    NotificationsModule,
  ],
  controllers: [
    SupportController,
    AdminSupportController,
    SupportWebhooksController,
    SupportContactController,
  ],
  providers: [SupportService, SupportRepository, SupportGateway, SupportOutboxPublisher],
  exports: [SupportService],
})
export class SupportModule {}
