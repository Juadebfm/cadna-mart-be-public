import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupportTicket, TicketCategory, TicketStatus } from './schemas/support-ticket.schema';
import { SupportRepository } from './support.repository';
import { CreateTicketDto, AddMessageDto } from './dto/ticket.dto';
import { UploadService } from '@upload/upload.service';
import { FileTypeValidator, MaxFileSizeValidator } from '@nestjs/common';

@Injectable()
export class SupportService {
  constructor(
    private readonly repo: SupportRepository,
    private readonly uploadService: UploadService,
  ) {}

  private toDto(t: SupportTicket): object {
    const id = (t as unknown as { _id: { toString(): string } })._id.toString();
    return {
      id,
      userId: t.userId,
      accountType: t.accountType,
      guestEmail: t.guestEmail,
      subject: t.subject,
      body: t.body,
      category: t.category,
      categoryLabel: this.categoryLabel(t.category, t.accountType),
      status: t.status,
      displayStatus:
        t.status === TicketStatus.CLOSED
          ? 'Resolved'
          : t.accountType === 'seller'
            ? 'In review'
            : 'Processing',
      assignedTo: t.assignedTo,
      messages: t.messages,
      orderId: t.orderId,
      // Legacy attachments contain public Cloudinary URLs. New attachments are
      // returned only through the owner-checked private attachment route.
      attachments: [],
      privateAttachments: t.privateAttachments ?? [],
      closedAt: t.closedAt,
      withdrawnAt: t.withdrawnAt,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  async create(
    dto: CreateTicketDto,
    userId: string,
    accountType = 'buyer',
    files: Express.Multer.File[] = [],
  ): Promise<object> {
    this.validateCategory(dto.category ?? TicketCategory.OTHER, accountType);
    if (accountType === 'seller' && files.length) {
      throw new BadRequestException('Seller tickets do not accept attachments');
    }
    let orderId: string | null = null;
    if (dto.orderId) {
      const order = await this.repo.findAccessibleOrder(userId, accountType, dto.orderId);
      if (!order)
        throw new BadRequestException('The order reference is not available to this account');
      orderId = order.orderRef;
    }
    const attachmentValidator = new FileTypeValidator({
      fileType: /^(image\/(jpeg|jpg|png|webp|gif)|application\/pdf)$/,
    });
    const sizeValidator = new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 });
    const uploaded: Array<{
      storageKey: string;
      resourceType: string;
      format: string;
      originalFileName: string;
      contentType: string;
      sizeBytes: number;
    }> = [];

    try {
      for (const file of files) {
        if (!(await attachmentValidator.isValid(file)) || !(await sizeValidator.isValid(file))) {
          throw new BadRequestException(
            'Attachments must be JPG, PNG, WebP, GIF, or PDF files up to 5 MB',
          );
        }
        const stored = await this.uploadService.uploadPrivateSupportAttachment(file, userId);
        uploaded.push({
          ...stored,
          originalFileName: this.safeFileName(file.originalname),
          contentType: file.mimetype,
        });
      }

      const ticket = await this.repo.create(
        {
          userId: userId as unknown as SupportTicket['userId'],
          accountType,
          guestEmail: null,
          subject: dto.subject.trim(),
          body: dto.body.trim(),
          category: dto.category ?? TicketCategory.OTHER,
          orderId,
          attachments: [],
          messages: [
            {
              authorId: userId,
              authorRole: accountType,
              body: dto.body.trim(),
              sentAt: new Date(),
            },
          ],
        } as Partial<SupportTicket>,
        uploaded,
      );
      return this.toDto(ticket);
    } catch (error) {
      await Promise.allSettled(
        uploaded.map((attachment) =>
          this.uploadService.deletePrivateSupportAttachment(
            attachment.storageKey,
            attachment.resourceType,
          ),
        ),
      );
      throw error;
    }
  }

  async findByUser(userId: string, accountType: string, page = 1, limit = 20): Promise<object> {
    const { items, totalItems } = await this.repo.findByUser(userId, accountType, page, limit);
    return {
      items: items.map((t) => this.toDto(t)),
      pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };
  }

  async findById(id: string): Promise<object> {
    const t = await this.repo.findById(id);
    if (!t) throw new NotFoundException('Support ticket not found');
    return this.toDto(t);
  }

  async findByIdForUser(id: string, userId: string, accountType: string): Promise<object> {
    const ticket = await this.repo.findByUserAndId(userId, accountType, id);
    if (!ticket) throw new NotFoundException('Support ticket not found');
    return this.toDto(ticket);
  }

  async findMessagesForUser(
    id: string,
    userId: string,
    accountType: string,
    afterSequence = 0,
    limit = 100,
  ): Promise<object> {
    const ticket = await this.repo.findByUserAndId(userId, accountType, id);
    if (!ticket) throw new NotFoundException('Support ticket not found');
    return this.repo.findMessagesAfter(id, afterSequence, limit);
  }

  async getAttachmentDownloadUrlForUser(
    ticketId: string,
    attachmentId: string,
    userId: string,
    accountType: string,
  ): Promise<object> {
    const ticket = await this.repo.findByUserAndId(userId, accountType, ticketId);
    if (!ticket) throw new NotFoundException('Support ticket not found');
    const attachment = await this.repo.findAttachmentForTicket(ticketId, attachmentId);
    if (!attachment) throw new NotFoundException('Support attachment not found');
    return {
      url: this.uploadService.createPrivateSupportAttachmentDownloadUrl(
        attachment.storageKey,
        attachment.resourceType,
        attachment.format,
        60,
      ),
      expiresInSeconds: 60,
    };
  }

  async getAttachmentDownloadUrlForAdmin(ticketId: string, attachmentId: string): Promise<object> {
    const ticket = await this.repo.findById(ticketId);
    if (!ticket) throw new NotFoundException('Support ticket not found');
    const attachment = await this.repo.findAttachmentForTicket(ticketId, attachmentId);
    if (!attachment) throw new NotFoundException('Support attachment not found');
    return {
      url: this.uploadService.createPrivateSupportAttachmentDownloadUrl(
        attachment.storageKey,
        attachment.resourceType,
        attachment.format,
        60,
      ),
      expiresInSeconds: 60,
    };
  }

  async authorizeRealtimeAccess(
    id: string,
    userId: string,
    accountTypes: string[],
    accountType?: string,
  ): Promise<boolean> {
    if (accountTypes.includes('admin')) return !!(await this.repo.findById(id));
    if (!accountType || !['buyer', 'seller'].includes(accountType)) return false;
    if (!accountTypes.includes(accountType)) return false;
    return !!(await this.repo.findByUserAndId(userId, accountType, id));
  }

  async addRealtimeMessage(
    id: string,
    dto: AddMessageDto,
    user: { userId: string; accountTypes: string[]; accountType?: string },
  ): Promise<object> {
    if (!user.accountTypes.includes('admin')) {
      const accountType = user.accountType;
      if (
        !accountType ||
        !['buyer', 'seller'].includes(accountType) ||
        !user.accountTypes.includes(accountType)
      ) {
        throw new NotFoundException('Support ticket not found');
      }
      const added = await this.repo.pushMessageForUser(user.userId, accountType, id, {
        authorId: user.userId,
        authorRole: accountType,
        body: dto.body,
        sentAt: new Date(),
        clientMessageId: dto.clientMessageId,
      });
      if (!added) throw new NotFoundException('Support ticket not found');
      if (dto.clientMessageId) {
        const duplicate = await this.repo.findMessageByClientId(id, dto.clientMessageId);
        if (duplicate) return duplicate;
      }
      const ticket = await this.repo.findByUserAndId(user.userId, accountType, id);
      const message = ticket?.messages.at(-1);
      if (!message) throw new NotFoundException('Support ticket message not found');
      return message;
    }

    await this.addMessage(id, dto, user.userId, 'admin');
    if (dto.clientMessageId) {
      const duplicate = await this.repo.findMessageByClientId(id, dto.clientMessageId);
      if (duplicate) return duplicate;
    }
    const ticket = await this.repo.findById(id);
    const message = ticket?.messages.at(-1);
    if (!message) throw new NotFoundException('Support ticket message not found');
    return message;
  }

  async addMessageForUser(
    id: string,
    dto: AddMessageDto,
    userId: string,
    accountType: string,
  ): Promise<object> {
    const current = await this.repo.findByUserAndId(userId, accountType, id);
    if (!current) throw new NotFoundException('Support ticket not found');
    if (current.status === TicketStatus.CLOSED || current.withdrawnAt) {
      throw new ConflictException('This support ticket is resolved');
    }
    const added = await this.repo.pushMessageForUser(id, userId, accountType, {
      authorId: userId,
      authorRole: accountType,
      body: dto.body.trim(),
      sentAt: new Date(),
      clientMessageId: dto.clientMessageId,
    });
    if (!added) throw new NotFoundException('Support ticket not found');
    return this.findByIdForUser(id, userId, accountType);
  }

  async closeForUser(id: string, userId: string, accountType: string): Promise<object> {
    const updated = await this.repo.updateForUser(userId, accountType, id, {
      status: TicketStatus.CLOSED,
      closedAt: new Date(),
    } as Partial<SupportTicket>);
    if (!updated) throw new NotFoundException('Support ticket not found');
    return this.toDto(updated);
  }

  async withdrawForUser(id: string, userId: string, accountType: string): Promise<object> {
    const updated = await this.repo.updateForUser(userId, accountType, id, {
      status: TicketStatus.CLOSED,
      closedAt: new Date(),
      withdrawnAt: new Date(),
    } as Partial<SupportTicket>);
    if (!updated) throw new NotFoundException('Support ticket not found');
    return this.toDto(updated);
  }

  async addMessage(
    id: string,
    dto: AddMessageDto,
    authorId: string,
    authorRole: string,
  ): Promise<object> {
    const t = await this.repo.findById(id);
    if (!t) throw new NotFoundException('Support ticket not found');
    if (t.status === TicketStatus.CLOSED || t.withdrawnAt) {
      throw new ConflictException('This support ticket is resolved');
    }
    const added = await this.repo.pushMessage(id, {
      authorId,
      authorRole,
      body: dto.body.trim(),
      sentAt: new Date(),
      clientMessageId: dto.clientMessageId,
    });
    if (!added) throw new ConflictException('This support ticket no longer accepts messages');
    const updated = await this.repo.findById(id);
    if (!updated) throw new NotFoundException('Ticket not found after update');
    return this.toDto(updated);
  }

  async findAll(page = 1, limit = 20, status?: TicketStatus, assignedTo?: string): Promise<object> {
    const { items, totalItems } = await this.repo.findAll(page, limit, status, assignedTo);
    return {
      items: items.map((t) => this.toDto(t)),
      pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };
  }

  private validateCategory(category: TicketCategory, accountType: string): void {
    const buyerCategories = [
      TicketCategory.ORDER,
      TicketCategory.PAYMENT,
      TicketCategory.RETURNS,
      TicketCategory.ACCOUNT,
      TicketCategory.PRODUCT,
      TicketCategory.OTHER,
    ];
    const sellerCategories = [
      TicketCategory.ORDER,
      TicketCategory.PAYOUT,
      TicketCategory.PRODUCT,
      TicketCategory.KYC_VERIFICATION,
      TicketCategory.OTHER,
    ];
    const allowed = accountType === 'seller' ? sellerCategories : buyerCategories;
    if (!allowed.includes(category)) {
      throw new BadRequestException(
        `The ${category} category is not available for ${accountType} tickets`,
      );
    }
  }

  private categoryLabel(category: TicketCategory, accountType: string): string {
    const labels: Record<string, string> = {
      order: 'Orders & delivery',
      payment: accountType === 'seller' ? 'Payout & wallet' : 'Payments',
      payout: 'Payout & wallet',
      returns: 'Returns & refunds',
      account: 'Account',
      product: 'Product & listings',
      kyc_verification: 'KYC verification',
      other: 'Other',
    };
    return labels[category] ?? 'Other';
  }

  private safeFileName(value: string): string {
    const name =
      value
        .split(/[\\/]/)
        .pop()
        ?.replace(/[\r\n\0]/g, '')
        .trim() ?? '';
    return name.slice(0, 120) || 'support-attachment';
  }

  async assign(id: string, agentId: string): Promise<object> {
    const t = await this.repo.findById(id);
    if (!t) throw new NotFoundException('Support ticket not found');
    const updated = await this.repo.update(id, {
      assignedTo: agentId as unknown as SupportTicket['assignedTo'],
      status: TicketStatus.IN_PROGRESS,
    } as Partial<SupportTicket>);
    if (!updated) throw new NotFoundException('Ticket not found after update');
    return this.toDto(updated);
  }

  async escalate(id: string, note?: string): Promise<object> {
    const t = await this.repo.findById(id);
    if (!t) throw new NotFoundException('Support ticket not found');
    if (note) {
      await this.repo.pushMessage(id, {
        authorId: 'system',
        authorRole: 'system',
        body: `Escalated: ${note}`,
        sentAt: new Date(),
      });
    }
    const updated = await this.repo.update(id, {
      status: TicketStatus.ESCALATED,
    } as Partial<SupportTicket>);
    if (!updated) throw new NotFoundException('Ticket not found after update');
    return this.toDto(updated);
  }

  async close(id: string): Promise<object> {
    const t = await this.repo.findById(id);
    if (!t) throw new NotFoundException('Support ticket not found');
    const updated = await this.repo.update(id, {
      status: TicketStatus.CLOSED,
      closedAt: new Date(),
    } as Partial<SupportTicket>);
    if (!updated) throw new NotFoundException('Ticket not found after update');
    return this.toDto(updated);
  }
}
