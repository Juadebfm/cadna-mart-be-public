import { Controller, Post, Req, Res, HttpCode, HttpStatus, RawBodyRequest } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Webhook } from 'svix';
import { ConfigService } from '@config/config.service';
import { UsersService } from '@users/users.service';
import { LoggerService } from '@logger/logger.service';
import { Public } from '@auth/decorators/public.decorator';
import { NotificationsService } from '@notifications/notifications.service';
import { NotificationCategory } from '@notifications/schemas/notification.schema';
import { DataRequestsService } from '@data-requests/data-requests.service';
import { DataRequestKind, DataRequestSource } from '@data-requests/schemas/data-request.schema';

interface ClerkUserData {
  id: string;
  primary_email_address_id?: string | null;
  primary_phone_number_id?: string | null;
  email_addresses: Array<{
    id: string;
    email_address: string;
    verification?: { status: string } | null;
  }>;
  phone_numbers?: Array<{
    id: string;
    phone_number: string;
    verification?: { status: string } | null;
  }>;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
}

@ApiTags('Webhooks')
@Controller('webhooks')
export class ClerkWebhookController {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly logger: LoggerService,
    private readonly notificationsService: NotificationsService,
    private readonly dataRequestsService: DataRequestsService,
  ) {}

  @Public()
  @Post('clerk')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Clerk webhook endpoint' })
  async handleClerkWebhook(@Req() req: RawBodyRequest<Request>, @Res() res: Response) {
    const webhookSecret = this.configService.clerk.webhookSecret;

    if (!webhookSecret) {
      this.logger.error('CLERK_WEBHOOK_SECRET is not configured', undefined, 'ClerkWebhook');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    const svixId = req.headers['svix-id'] as string;
    const svixTimestamp = req.headers['svix-timestamp'] as string;
    const svixSignature = req.headers['svix-signature'] as string;

    if (!svixId || !svixTimestamp || !svixSignature) {
      return res.status(400).json({ error: 'Missing svix headers' });
    }

    let event: { type: string; data: ClerkUserData };
    try {
      const wh = new Webhook(webhookSecret);
      if (!req.rawBody) return res.status(400).json({ error: 'Missing raw request body' });
      event = wh.verify(req.rawBody, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as typeof event;
    } catch (err) {
      this.logger.error(
        `Clerk webhook verification failed: ${(err as Error).message}`,
        undefined,
        'ClerkWebhook',
      );
      return res.status(400).json({ error: 'Webhook verification failed' });
    }

    try {
      switch (event.type) {
        case 'user.created':
          await this.handleUserCreated(event.data);
          break;
        case 'user.updated':
          await this.handleUserUpdated(event.data);
          break;
        case 'user.deleted':
          await this.handleUserDeleted(event.data);
          break;
        default:
          this.logger.debug(`Unhandled Clerk event: ${event.type}`, 'ClerkWebhook');
      }
    } catch (err) {
      this.logger.error(
        `Clerk webhook handler error: ${(err as Error).message}`,
        (err as Error).stack,
        'ClerkWebhook',
      );
      return res.status(500).json({ error: 'Webhook handler failed' });
    }

    return res.status(200).json({ received: true });
  }

  private async handleUserCreated(data: ClerkUserData): Promise<void> {
    await this.syncClerkUser(data);
  }

  private async handleUserUpdated(data: ClerkUserData): Promise<void> {
    await this.syncClerkUser(data);
  }

  private async syncClerkUser(data: ClerkUserData): Promise<void> {
    const email = data.email_addresses?.find((item) => item.id === data.primary_email_address_id);
    const verifiedEmail =
      email?.verification?.status === 'verified' ? email.email_address.trim().toLowerCase() : null;
    const phone = data.phone_numbers?.find((item) => item.id === data.primary_phone_number_id);
    const verifiedPhone = phone?.verification?.status === 'verified' ? phone.phone_number : null;

    // Webhooks may sync an identity only after the buyer has explicitly linked
    // it, or create a new buyer. A matching email alone must never link accounts.
    let user = await this.usersService.findByClerkId(data.id);
    if (!user) {
      if (!verifiedEmail && !verifiedPhone) return;

      if (verifiedEmail && (await this.usersService.findByEmail(verifiedEmail))) {
        this.logger.warn(
          `Clerk user ${data.id} shares an email with an existing Cadna account; explicit linking is required`,
          'ClerkWebhook',
        );
        return;
      }

      const identity = {
        clerkId: data.id,
        email: verifiedEmail,
        phoneNumber: verifiedPhone,
        isPhoneVerified: !!verifiedPhone,
        firstName: data.first_name || 'User',
        lastName: data.last_name || '',
      };
      user = await this.usersService.createClerkBuyer(identity);
    } else {
      if (user.clerkId && user.clerkId !== data.id) {
        this.logger.warn(
          `Clerk user ${data.id} conflicts with an existing linked account`,
          'ClerkWebhook',
        );
        return;
      }
      const retainedVerifiedEmail =
        user.email &&
        data.email_addresses?.some(
          (item) =>
            item.email_address.trim().toLowerCase() === user!.email &&
            item.verification?.status === 'verified',
        )
          ? user.email
          : null;
      const retainedVerifiedPhone =
        user.phoneNumber &&
        data.phone_numbers?.some(
          (item) =>
            item.phone_number === user!.phoneNumber && item.verification?.status === 'verified',
        )
          ? user.phoneNumber
          : null;
      const emailOwner = verifiedEmail ? await this.usersService.findByEmail(verifiedEmail) : null;
      const verifiedEmailForSync =
        emailOwner && emailOwner._id.toString() !== user._id.toString()
          ? retainedVerifiedEmail
          : verifiedEmail;
      if (emailOwner && emailOwner._id.toString() !== user._id.toString()) {
        this.logger.warn(
          `Verified Clerk email for ${data.id} is already used by another Cadna account; keeping the current email`,
          'ClerkWebhook',
        );
      }
      const existingEmail = user.email;
      const existingPhone = user.phoneNumber;
      user = await this.usersService.syncClerkIdentity(user._id.toString(), {
        clerkId: data.id,
        email: verifiedEmailForSync ?? retainedVerifiedEmail,
        phoneNumber: verifiedPhone ?? retainedVerifiedPhone,
        isPhoneVerified: !!(verifiedPhone ?? retainedVerifiedPhone),
        firstName: data.first_name || user.firstName,
        lastName: data.last_name || user.lastName,
      });
      if (existingEmail !== user.email || existingPhone !== user.phoneNumber) {
        try {
          await this.notificationsService.createForUser({
            userId: user._id.toString(),
            category: NotificationCategory.SECURITY_ALERTS,
            title: 'Account contact details changed',
            body: 'A verified email address or phone number on your account was changed.',
          });
        } catch (error) {
          this.logger.warn(
            `Could not create contact-change notification for user ${user._id.toString()}: ${(error as Error).message}`,
            'ClerkWebhook',
          );
        }
      }
    }

    this.logger.log(`Clerk user synced (${data.id})`, 'ClerkWebhook');
  }

  private async handleUserDeleted(data: ClerkUserData): Promise<void> {
    const user = await this.usersService.findByClerkId(data.id);
    if (!user) return;

    const userId = (user as unknown as { _id: { toString(): string } })._id.toString();
    await this.dataRequestsService.create(
      userId,
      DataRequestKind.DELETE,
      'Clerk identity was deleted; data erasure is queued for administrator review',
      user.email,
      user.isPhoneVerified ? user.phoneNumber : null,
      DataRequestSource.CLERK,
    );
    await this.usersService.setActive(userId, false);

    this.logger.log(`Clerk user deleted: ${data.id}`, 'ClerkWebhook');
  }
}
