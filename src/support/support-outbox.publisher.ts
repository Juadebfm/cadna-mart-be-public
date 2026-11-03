import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SupportRepository } from './support.repository';
import { SupportGateway } from './support.gateway';
import { NotificationsService } from '@notifications/notifications.service';
import { NotificationCategory } from '@notifications/schemas/notification.schema';

@Injectable()
export class SupportOutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SupportOutboxPublisher.name);
  private timer?: NodeJS.Timeout;
  private polling = false;

  constructor(
    private readonly repository: SupportRepository,
    private readonly gateway: SupportGateway,
    private readonly notificationsService: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.poll(), 1000);
    this.timer.unref();
    void this.poll();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const events = await this.repository.claimOutboxEvents();
      for (const event of events) {
        try {
          await this.publish(event);
          await this.repository.markOutboxPublished(event.id);
        } catch {
          this.logger.warn(`Support event ${event.id} could not be published.`);
          await this.repository.retryOutboxEvent(event.id, event.attempts, 'publish_failed');
        }
      }
    } catch {
      this.logger.warn('Support event outbox poll failed.');
    } finally {
      this.polling = false;
    }
  }

  private async publish(event: {
    id: string;
    ticketId: string;
    eventType: string;
    payload: unknown;
  }): Promise<void> {
    const payload = event.payload as Record<string, unknown>;
    const ticket = await this.repository.findById(event.ticketId);
    if (!ticket) return;
    if (event.eventType === 'ticket.message.created') {
      const messageId = typeof payload.messageId === 'string' ? payload.messageId : '';
      const message = await this.repository.findMessageById(event.ticketId, messageId);
      if (!message) return;
      this.gateway.publishTicketMessage(event.id, event.ticketId, {
        id: message.id,
        sequence: message.sequence,
        clientMessageId: message.clientMessageId,
        authorId: message.authorUserId ?? 'system',
        authorRole: message.authorRole,
        body: message.body,
        sentAt: message.sentAt,
      });
      if (message.authorRole === 'admin' && ticket.userId && !ticket.withdrawnAt) {
        await this.notificationsService.createForUser({
          userId: ticket.userId,
          category: NotificationCategory.SUPPORT_UPDATES,
          title: 'Support replied to your ticket',
          body: ticket.subject,
          actionUrl: `/support/tickets/${ticket.id}?accountType=${ticket.accountType}`,
          sendEmail: false,
          idempotencyKey: event.id,
        });
      }
      return;
    }

    if (event.eventType === 'ticket.updated') {
      this.gateway.publishTicketUpdated(event.id, event.ticketId, {
        status: payload.status,
        accountType: payload.accountType,
        withdrawnAt: payload.withdrawnAt,
      });
      if (payload.notifyUser === true && ticket.userId && !ticket.withdrawnAt) {
        const statusLabel =
          ticket.status === 'closed'
            ? 'Resolved'
            : ticket.accountType === 'seller'
              ? 'In review'
              : 'Processing';
        await this.notificationsService.createForUser({
          userId: ticket.userId,
          category: NotificationCategory.SUPPORT_UPDATES,
          title: 'Your support ticket was updated',
          body: `${ticket.subject}: ${statusLabel}`,
          actionUrl: `/support/tickets/${ticket.id}?accountType=${ticket.accountType}`,
          sendEmail: false,
          idempotencyKey: event.id,
        });
      }
    }
  }
}
