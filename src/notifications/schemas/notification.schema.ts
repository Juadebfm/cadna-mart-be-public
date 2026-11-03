import { BaseSchema } from '@shared/base/base.schema';
export enum NotificationChannel {
  IN_APP = 'in_app',
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
}
export enum NotificationCategory {
  ORDER_UPDATES = 'orderUpdates',
  PROMOTIONS = 'promotions',
  NEWSLETTER = 'newsletter',
  SECURITY_ALERTS = 'securityAlerts',
  SUPPORT_UPDATES = 'supportUpdates',
}
export class Notification extends BaseSchema {
  userId!: string;
  title!: string;
  body!: string;
  actionUrl!: string | null;
  isRead!: boolean;
  readAt!: Date | null;
  type!: string;
  sourceEventId!: string | null;
}
