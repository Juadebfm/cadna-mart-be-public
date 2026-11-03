import { Injectable } from '@nestjs/common';
import { NotificationsRepository } from './notifications.repository';
import { NotificationPreferencesDto } from './dto/notification.dto';
import { UsersService } from '@users/users.service';
import { NotificationCategory, Notification } from './schemas/notification.schema';
import { EmailService } from '@email/email.service';
import { StackApiSmsService } from './stackapi-sms.service';
import { FirebasePushService } from './firebase-push.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly repo: NotificationsRepository,
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
    private readonly smsService: StackApiSmsService,
    private readonly pushService: FirebasePushService,
  ) {}

  async findByUser(userId: string, page: number, limit: number): Promise<object> {
    const { items, totalItems } = await this.repo.findByUser(userId, page, limit);
    return {
      items,
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  async markRead(id: string, userId: string): Promise<object> {
    const notification = await this.repo.markRead(id, userId);
    return { notification };
  }

  async updatePreferences(userId: string, dto: NotificationPreferencesDto): Promise<object> {
    return { preferences: await this.usersService.updateNotificationPreferences(userId, dto) };
  }

  async getPreferences(userId: string): Promise<object> {
    return { preferences: await this.usersService.getNotificationPreferences(userId) };
  }

  async createForUser(input: {
    userId: string;
    category: NotificationCategory;
    title: string;
    body: string;
    actionUrl?: string;
    sendEmail?: boolean;
    idempotencyKey?: string;
  }): Promise<{ notification: Notification | null; suppressed: boolean }> {
    const user = await this.usersService.findById(input.userId);
    const preferences = user.notificationPreferences ?? {
      orderUpdates: true,
      promotions: false,
      newsletter: false,
      securityAlerts: true,
      supportUpdates: true,
    };
    if (!preferences[input.category]) return { notification: null, suppressed: true };
    if (
      (input.category === NotificationCategory.PROMOTIONS ||
        input.category === NotificationCategory.NEWSLETTER) &&
      !user.marketingConsentAt
    ) {
      return { notification: null, suppressed: true };
    }
    if (input.idempotencyKey) {
      const existing = await this.repo.findBySourceEventId(input.idempotencyKey);
      if (existing) return { notification: existing, suppressed: false };
    }
    const notification = await this.repo.create({
      userId: input.userId as any,
      title: input.title,
      body: input.body,
      actionUrl: input.actionUrl ?? null,
      type: input.category,
      sourceEventId: input.idempotencyKey ?? null,
    } as Partial<Notification>);

    const deliveries: Promise<unknown>[] = [];
    if (input.sendEmail !== false && user.email && user.isVerified) {
      deliveries.push(
        this.emailService.sendNotificationEmail({
          to: user.email,
          title: input.title,
          body: input.body,
          ...(input.actionUrl ? { actionUrl: input.actionUrl } : {}),
        }),
      );
    }

    deliveries.push(
      this.pushService.sendToUser(input.userId, input.title, input.body, input.actionUrl),
    );

    if (
      (input.category === NotificationCategory.ORDER_UPDATES ||
        input.category === NotificationCategory.SECURITY_ALERTS) &&
      user.phoneNumber &&
      user.isPhoneVerified
    ) {
      deliveries.push(this.smsService.send(user.phoneNumber, `${input.title}: ${input.body}`));
    }
    await Promise.allSettled(deliveries.map((delivery) => this.withDeliveryTimeout(delivery)));
    return { notification, suppressed: false };
  }

  private async withDeliveryTimeout<T>(delivery: Promise<T>): Promise<T | null> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        delivery,
        new Promise<null>((resolve) => {
          timeout = setTimeout(() => resolve(null), 5000);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  async broadcast(dto: {
    title: string;
    body: string;
    userIds?: string[];
    accountType?: string;
  }): Promise<object> {
    // Deferred: fan-out requires a queue / FCM integration
    return {
      queued: true,
      targetUserIds: dto.userIds?.length ?? 0,
      targetAccountType: dto.accountType ?? null,
      note: 'broadcast queued (FCM/push integration deferred)',
    };
  }
}
