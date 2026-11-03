import { UsersService } from '@users/users.service';
import { EmailService } from '@email/email.service';
import { NotificationCategory } from './schemas/notification.schema';
import { NotificationsRepository } from './notifications.repository';
import { StackApiSmsService } from './stackapi-sms.service';
import { FirebasePushService } from './firebase-push.service';
import { NotificationsService } from './notifications.service';
import { User } from '@users/schemas/user.schema';

const newId = (): string => Math.random().toString(16).slice(2).padEnd(24, '0').slice(0, 24);

describe('NotificationsService delivery preferences', () => {
  const userId = '507f1f77bcf86cd799439011';
  let service: NotificationsService;
  let usersService: jest.Mocked<
    Pick<UsersService, 'findById' | 'getNotificationPreferences' | 'updateNotificationPreferences'>
  >;
  let repo: jest.Mocked<Pick<NotificationsRepository, 'create'>>;
  let emailService: jest.Mocked<Pick<EmailService, 'sendNotificationEmail'>>;
  let smsService: jest.Mocked<Pick<StackApiSmsService, 'send'>>;
  let pushService: jest.Mocked<Pick<FirebasePushService, 'sendToUser'>>;

  const createUser = (overrides: Partial<User> = {}): User =>
    ({
      _id: userId,
      notificationPreferences: {
        orderUpdates: true,
        promotions: false,
        newsletter: false,
        securityAlerts: true,
      },
      email: 'buyer@example.com',
      isVerified: true,
      phoneNumber: '+2348012345678',
      isPhoneVerified: true,
      marketingConsentAt: null,
      ...overrides,
    }) as User;

  beforeEach(() => {
    usersService = {
      findById: jest.fn().mockResolvedValue(createUser()),
      getNotificationPreferences: jest.fn(),
      updateNotificationPreferences: jest.fn(),
    };
    repo = { create: jest.fn().mockResolvedValue({ _id: newId() }) };
    emailService = { sendNotificationEmail: jest.fn().mockResolvedValue(true) };
    smsService = { send: jest.fn().mockResolvedValue(true) };
    pushService = { sendToUser: jest.fn().mockResolvedValue(true) };
    service = new NotificationsService(
      repo as unknown as NotificationsRepository,
      usersService as unknown as UsersService,
      emailService as unknown as EmailService,
      smsService as unknown as StackApiSmsService,
      pushService as unknown as FirebasePushService,
    );
  });

  it('suppresses a category when its buyer preference is disabled', async () => {
    usersService.findById.mockResolvedValue(
      createUser({
        notificationPreferences: { ...createUser().notificationPreferences, orderUpdates: false },
      }),
    );

    const result = await service.createForUser({
      userId,
      category: NotificationCategory.ORDER_UPDATES,
      title: 'Order placed',
      body: 'Your order was received.',
    });

    expect(result.suppressed).toBe(true);
    expect(repo.create).not.toHaveBeenCalled();
    expect(emailService.sendNotificationEmail).not.toHaveBeenCalled();
    expect(smsService.send).not.toHaveBeenCalled();
    expect(pushService.sendToUser).not.toHaveBeenCalled();
  });

  it('requires both category preference and marketing consent for promotions', async () => {
    usersService.findById.mockResolvedValue(
      createUser({
        notificationPreferences: { ...createUser().notificationPreferences, promotions: true },
      }),
    );

    const result = await service.createForUser({
      userId,
      category: NotificationCategory.PROMOTIONS,
      title: 'Sale',
      body: 'A sale is live.',
    });

    expect(result.suppressed).toBe(true);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('sends order/security notices by email, push, and verified SMS only', async () => {
    await service.createForUser({
      userId,
      category: NotificationCategory.ORDER_UPDATES,
      title: 'Payment confirmed',
      body: 'Your payment was confirmed.',
    });

    expect(emailService.sendNotificationEmail).toHaveBeenCalledWith({
      to: 'buyer@example.com',
      title: 'Payment confirmed',
      body: 'Your payment was confirmed.',
    });
    expect(pushService.sendToUser).toHaveBeenCalledWith(
      userId,
      'Payment confirmed',
      'Your payment was confirmed.',
      undefined,
    );
    expect(smsService.send).toHaveBeenCalledWith(
      '+2348012345678',
      'Payment confirmed: Your payment was confirmed.',
    );
  });

  it('does not send SMS for promotions and suppresses push to unverified email independently', async () => {
    usersService.findById.mockResolvedValue(
      createUser({
        notificationPreferences: { ...createUser().notificationPreferences, promotions: true },
        marketingConsentAt: new Date(),
        isVerified: false,
      }),
    );

    await service.createForUser({
      userId,
      category: NotificationCategory.PROMOTIONS,
      title: 'Sale',
      body: 'A sale is live.',
    });

    expect(emailService.sendNotificationEmail).not.toHaveBeenCalled();
    expect(smsService.send).not.toHaveBeenCalled();
    expect(pushService.sendToUser).toHaveBeenCalled();
  });
});
