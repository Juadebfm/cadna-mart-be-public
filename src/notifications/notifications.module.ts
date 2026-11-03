import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import {
  AdminNotificationsController,
  NotificationWebhooksController,
} from './admin-notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './notifications.repository';
import { UsersModule } from '@users/users.module';
import { EmailModule } from '@email/email.module';
import { StackApiSmsService } from './stackapi-sms.service';
import { FirebasePushService } from './firebase-push.service';

@Module({
  imports: [UsersModule, EmailModule],
  controllers: [
    NotificationsController,
    AdminNotificationsController,
    NotificationWebhooksController,
  ],
  providers: [
    NotificationsService,
    NotificationsRepository,
    StackApiSmsService,
    FirebasePushService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
