import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createClerkClient } from '@clerk/backend';
import { AuthProvider } from '@users/enums/auth-provider.enum';
import { ConfigService } from '@config/config.service';
import { PrismaService } from '@database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { createPublicId } from '@database/id.util';
import { EmailService } from '@email/email.service';
import { UploadService } from '@upload/upload.service';
import { StackApiSmsService } from '@notifications/stackapi-sms.service';
import { DataRequestDecision, DataRequestRetentionItemDto } from './dto/process-data-request.dto';
import {
  DataRequestKind,
  DataRequestStatus,
  DataRequestSource,
  DataRetentionCategory,
} from './schemas/data-request.schema';

const PROCESSING_LEASE_MS = 5 * 60 * 1000;

@Injectable()
export class DataRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly uploadService: UploadService,
    private readonly emailService: EmailService,
    private readonly smsService: StackApiSmsService,
  ) {}

  async create(
    userId: string,
    kind: DataRequestKind,
    notes?: string,
    requesterEmail?: string | null,
    requesterPhone?: string | null,
    source: DataRequestSource = DataRequestSource.BUYER,
  ) {
    const existing = await this.prisma.dataRequest.findFirst({
      where: {
        userId,
        kind,
        status: {
          in: [
            DataRequestStatus.PENDING,
            DataRequestStatus.PROCESSING,
            DataRequestStatus.IN_PROGRESS,
          ],
        },
      },
    });
    if (existing) return { ...existing, _id: existing.id };

    const created = await this.prisma.dataRequest.create({
      data: {
        id: createPublicId(),
        userId,
        kind,
        source,
        notes: notes?.trim() || null,
        requesterEmail: requesterEmail?.trim().toLowerCase() || null,
        requesterPhone: requesterPhone?.trim() || null,
        responseDueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    if (created.requesterEmail || created.requesterPhone) {
      const sent = await this.sendNotice(
        created,
        'We received your account deletion request',
        'Your request is queued for review. We will notify you when it is approved, rejected, or completed.',
      );
      if (sent) {
        await this.prisma.dataRequest.update({
          where: { id: created.id },
          data: { acknowledgedAt: new Date() },
        });
      }
    }

    return { ...created, _id: created.id };
  }

  async processDeletionRequest(
    id: string,
    adminId: string,
    decision: DataRequestDecision,
    notes: string | undefined,
    retentionItems: DataRequestRetentionItemDto[] = [],
  ) {
    const request = await this.prisma.dataRequest.findUnique({
      where: { id },
      include: { retentionItems: true },
    });
    if (!request || request.kind !== DataRequestKind.DELETE) {
      throw new BadRequestException('Deletion request not found');
    }

    if (decision === DataRequestDecision.REJECT) {
      if (request.status !== DataRequestStatus.PENDING) {
        throw new ConflictException('Only pending requests can be rejected');
      }
      const rejected = await this.prisma.dataRequest.update({
        where: { id },
        data: {
          status: DataRequestStatus.REJECTED,
          processedById: adminId,
          processedAt: new Date(),
          decisionNotes: notes?.trim() || null,
        },
      });
      await this.sendDecisionEmail(rejected, 'rejected', notes);
      return { id, status: rejected.status, processedAt: rejected.processedAt };
    }

    if (
      ![
        DataRequestStatus.PENDING,
        DataRequestStatus.IN_PROGRESS,
        DataRequestStatus.PROCESSING,
      ].includes(request.status as DataRequestStatus)
    ) {
      throw new ConflictException('This request cannot be approved from its current status');
    }

    const newItems = retentionItems.length ? this.validateRetentionItems(retentionItems) : [];
    const items = this.mergeRetentionItems(request.retentionItems, newItems);
    if (!request.userId) {
      throw new ConflictException('The account record for this request is no longer available');
    }

    const now = new Date();
    const leaseExpiredAt = new Date(now.getTime() - PROCESSING_LEASE_MS);
    const claim = await this.prisma.dataRequest.updateMany({
      where: {
        id,
        status: {
          in: [
            DataRequestStatus.PENDING,
            DataRequestStatus.IN_PROGRESS,
            DataRequestStatus.PROCESSING,
          ],
        },
        OR: [{ processingStartedAt: null }, { processingStartedAt: { lt: leaseExpiredAt } }],
      },
      data: {
        status: DataRequestStatus.PROCESSING,
        processingStartedAt: now,
        processedById: adminId,
        processedAt: now,
        decisionNotes: notes?.trim() || request.decisionNotes,
        notes: null,
      },
    });
    if (!claim.count)
      throw new ConflictException('This deletion request is already being processed');

    try {
      const existingCategories = new Set(request.retentionItems.map((item) => item.category));
      const itemsToCreate = items.filter((item) => !existingCategories.has(item.category));
      if (itemsToCreate.length) {
        await this.prisma.dataRequestRetention.createMany({
          data: itemsToCreate.map((item) => ({
            id: createPublicId(),
            requestId: id,
            category: item.category,
            lawfulBasis: item.lawfulBasis.trim(),
            purpose: item.purpose.trim(),
            retainUntil: new Date(item.retainUntil),
          })),
        });
      }

      const user = await this.prisma.user.findUnique({ where: { id: request.userId } });
      if (!user)
        throw new ConflictException('The account record for this request is no longer available');
      const categories = items.map((item) => item.category);
      await this.ensureOperationalRecordsHaveDisposition(user.id, categories);
      await this.deleteSellerApplicationDocuments(user.id);
      await this.deleteReviewImages(user.id);
      await this.removeExternalIdentity(id, user);
      await this.deleteNonretainedSupportMedia(
        user.id,
        categories.includes(DataRetentionCategory.SUPPORT_TICKETS),
      );
      await this.eraseNonretainedData(id, user.id, categories);
      return await this.getRequestStatus(id);
    } catch (error) {
      await this.prisma.dataRequest.updateMany({
        where: { id, status: DataRequestStatus.PROCESSING },
        data: { status: DataRequestStatus.IN_PROGRESS, processingStartedAt: null },
      });
      throw error;
    }
  }

  async purgeExpiredRetention(id: string, adminId: string) {
    const request = await this.prisma.dataRequest.findUnique({
      where: { id },
      include: { retentionItems: true },
    });
    if (!request || request.kind !== DataRequestKind.DELETE) {
      throw new BadRequestException('Deletion request not found');
    }
    if (
      ![DataRequestStatus.IN_PROGRESS, DataRequestStatus.PROCESSING].includes(
        request.status as DataRequestStatus,
      )
    ) {
      throw new ConflictException('Only in-progress deletion requests can be purged');
    }
    const now = new Date();
    const due = request.retentionItems.filter((item) => !item.purgedAt && item.retainUntil <= now);
    if (!due.length && request.retentionItems.some((item) => !item.purgedAt)) {
      return {
        id,
        status: request.status,
        purgedCategories: [],
        nextRetentionExpiry: request.retentionItems
          .filter((item) => !item.purgedAt)
          .sort((a, b) => a.retainUntil.getTime() - b.retainUntil.getTime())[0].retainUntil,
      };
    }

    const claim = await this.prisma.dataRequest.updateMany({
      where: {
        id,
        status: { in: [DataRequestStatus.IN_PROGRESS, DataRequestStatus.PROCESSING] },
        OR: [
          { processingStartedAt: null },
          { processingStartedAt: { lt: new Date(now.getTime() - PROCESSING_LEASE_MS) } },
        ],
      },
      data: {
        status: DataRequestStatus.PROCESSING,
        processingStartedAt: now,
        processedById: adminId,
      },
    });
    if (!claim.count)
      throw new ConflictException('This deletion request is already being processed');

    try {
      if (
        request.userId &&
        due.some((item) => item.category === DataRetentionCategory.SUPPORT_TICKETS)
      ) {
        await this.deleteSupportMedia(request.userId, { status: { not: 'open' } });
      }
      if (request.userId) {
        await this.prisma.$transaction(async (tx) => {
          for (const item of due) {
            await this.purgeCategory(tx, request.userId!, item.category as DataRetentionCategory);
            await tx.dataRequestRetention.update({
              where: { id: item.id },
              data: { purgedAt: new Date(), purgedById: adminId },
            });
          }
          const remaining = await tx.dataRequestRetention.count({
            where: { requestId: id, purgedAt: null },
          });
          if (remaining === 0) {
            await tx.user.deleteMany({ where: { id: request.userId! } });
          }
        });
      }

      const stillRetained = await this.prisma.dataRequestRetention.count({
        where: { requestId: id, purgedAt: null },
      });
      if (!stillRetained) {
        await this.prisma.dataRequest.update({
          where: { id },
          data: {
            status: DataRequestStatus.COMPLETED,
            completedAt: new Date(),
            processingStartedAt: null,
          },
        });
        await this.sendCompletionEmail(id);
      } else {
        await this.prisma.dataRequest.update({
          where: { id },
          data: { status: DataRequestStatus.IN_PROGRESS, processingStartedAt: null },
        });
      }

      return {
        id,
        status: stillRetained ? DataRequestStatus.IN_PROGRESS : DataRequestStatus.COMPLETED,
        purgedCategories: due.map((item) => item.category),
      };
    } catch (error) {
      await this.prisma.dataRequest.updateMany({
        where: { id, status: DataRequestStatus.PROCESSING },
        data: { status: DataRequestStatus.IN_PROGRESS, processingStartedAt: null },
      });
      throw error;
    }
  }

  async retryRequesterNotification(id: string) {
    const request = await this.prisma.dataRequest.findUnique({ where: { id } });
    if (!request) throw new BadRequestException('Data request not found');
    if (request.status === DataRequestStatus.COMPLETED) {
      await this.sendCompletionEmail(id);
    } else if (request.status === DataRequestStatus.REJECTED) {
      await this.sendDecisionEmail(request, 'rejected', request.decisionNotes);
    } else {
      await this.sendDecisionEmail(request, 'in progress', request.decisionNotes);
    }
    const updated = await this.prisma.dataRequest.findUniqueOrThrow({ where: { id } });
    return { id, status: updated.status, responseSentAt: updated.responseSentAt };
  }

  private validateRetentionItems(items: DataRequestRetentionItemDto[]) {
    const seen = new Set<string>();
    const now = Date.now();
    for (const item of items) {
      if (seen.has(item.category))
        throw new BadRequestException('Retention categories must be unique');
      if (!Object.values(DataRetentionCategory).includes(item.category))
        throw new BadRequestException('Unknown retention category');
      if (
        !item.lawfulBasis.trim() ||
        !item.purpose.trim() ||
        new Date(item.retainUntil).getTime() <= now
      ) {
        throw new BadRequestException(
          'Each retained category needs a lawful basis, purpose, and future retention deadline',
        );
      }
      seen.add(item.category);
    }
    return items;
  }

  private mergeRetentionItems(
    existingItems: Array<{
      category: string;
      lawfulBasis: string;
      purpose: string;
      retainUntil: Date;
    }>,
    incomingItems: DataRequestRetentionItemDto[],
  ) {
    const merged = new Map(existingItems.map((item) => [item.category, item]));
    for (const item of existingItems) {
      if (!Object.values(DataRetentionCategory).includes(item.category as DataRetentionCategory)) {
        throw new BadRequestException('The request contains an unsupported retention category');
      }
    }
    for (const item of incomingItems) {
      const existing = merged.get(item.category);
      if (existing) {
        const sameDeadline =
          existing.retainUntil.getTime() === new Date(item.retainUntil).getTime();
        if (
          existing.lawfulBasis !== item.lawfulBasis.trim() ||
          existing.purpose !== item.purpose.trim() ||
          !sameDeadline
        ) {
          throw new ConflictException(
            `Retention details for ${item.category} are already recorded and cannot be changed`,
          );
        }
        continue;
      }
      merged.set(item.category, { ...item, retainUntil: new Date(item.retainUntil) });
    }
    return [...merged.values()];
  }

  private async ensureOperationalRecordsHaveDisposition(userId: string, categories: string[]) {
    const retained = new Set(categories);
    const [openOrders, openReturns, openSupportTickets, wallet] = await Promise.all([
      this.prisma.order.count({
        where: {
          userId,
          status: {
            in: ['pending_payment', 'confirmed', 'processing', 'shipped', 'refund_requested'],
          },
        },
      }),
      this.prisma.returnRequest.count({
        where: { userId, status: { in: ['pending', 'approved'] } },
      }),
      this.prisma.supportTicket.count({ where: { userId, status: 'open' } }),
      this.prisma.wallet.findUnique({
        where: { userId },
        select: { balanceKobo: true, holds: true },
      }),
    ]);
    if ((openOrders || openReturns) && !retained.has(DataRetentionCategory.ORDERS_AND_RETURNS)) {
      throw new BadRequestException(
        'Open orders or returns need an approved orders_and_returns retention basis and deadline before account deletion can proceed',
      );
    }
    if (openSupportTickets && !retained.has(DataRetentionCategory.SUPPORT_TICKETS)) {
      throw new BadRequestException(
        'Open support or dispute cases need an approved support_tickets retention basis and deadline before account deletion can proceed',
      );
    }
    const activeWalletHolds = Array.isArray(wallet?.holds)
      ? wallet.holds.length > 0
      : !!wallet?.holds && typeof wallet.holds === 'object' && Object.keys(wallet.holds).length > 0;
    if ((wallet?.balanceKobo ?? 0) > 0 || activeWalletHolds) {
      if (!retained.has(DataRetentionCategory.WALLET_RECORDS)) {
        throw new BadRequestException(
          'A wallet with funds or active holds needs an approved wallet_records retention basis and deadline before account deletion can proceed',
        );
      }
    }
  }

  private async removeExternalIdentity(
    requestId: string,
    user: {
      id: string;
      authProvider: string;
      clerkId: string | null;
      avatarPublicId: string | null;
    },
  ) {
    const request = await this.prisma.dataRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (
      user.authProvider === AuthProvider.CLERK &&
      user.clerkId &&
      !request.externalIdentityDeletedAt
    ) {
      const secretKey = this.configService.clerk.secretKey;
      if (!secretKey)
        throw new ServiceUnavailableException('Clerk account deletion is not configured');
      try {
        const clerk = createClerkClient({ secretKey });
        try {
          await clerk.users.getUser(user.clerkId);
          await clerk.users.deleteUser(user.clerkId);
        } catch (error) {
          if ((error as { status?: number }).status !== 404) throw error;
        }
      } catch {
        throw new ServiceUnavailableException(
          'The linked sign-in account could not be deleted; the request remains in progress',
        );
      }
      await this.prisma.dataRequest.update({
        where: { id: requestId },
        data: { externalIdentityDeletedAt: new Date() },
      });
    } else if (!request.externalIdentityDeletedAt) {
      await this.prisma.dataRequest.update({
        where: { id: requestId },
        data: { externalIdentityDeletedAt: new Date() },
      });
    }

    const refreshed = await this.prisma.dataRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (user.avatarPublicId && !refreshed.avatarMediaDeletedAt) {
      if (!this.configService.storage.cloudName) {
        throw new ServiceUnavailableException(
          'Profile media storage is not configured; the request remains in progress',
        );
      }
      try {
        await this.uploadService.deleteFile(user.avatarPublicId);
      } catch {
        throw new ServiceUnavailableException(
          'Profile media could not be deleted; the request remains in progress',
        );
      }
      await this.prisma.dataRequest.update({
        where: { id: requestId },
        data: { avatarMediaDeletedAt: new Date() },
      });
    } else if (!refreshed.avatarMediaDeletedAt) {
      await this.prisma.dataRequest.update({
        where: { id: requestId },
        data: { avatarMediaDeletedAt: new Date() },
      });
    }
  }

  private async deleteNonretainedSupportMedia(userId: string, retainOpenTickets: boolean) {
    await this.deleteSupportMedia(userId, retainOpenTickets ? { status: { not: 'open' } } : {});
  }

  async deleteSellerApplicationDocuments(userId: string): Promise<{ deleted: number }> {
    const documents = await this.prisma.sellerApplicationDocument.findMany({
      where: { deletedAt: null, sellerProfile: { userId } },
      select: { id: true, storageKey: true, resourceType: true },
    });
    if (documents.length && !this.configService.storage.cloudName) {
      throw new ServiceUnavailableException(
        'Seller identity storage is not configured; account erasure remains in progress',
      );
    }
    try {
      for (const document of documents) {
        await this.uploadService.deletePrivateSellerDocument(
          document.storageKey,
          document.resourceType,
        );
      }
    } catch {
      throw new ServiceUnavailableException(
        'Seller identity files could not be deleted; account erasure remains in progress',
      );
    }
    const result = documents.length
      ? await this.prisma.sellerApplicationDocument.updateMany({
          where: { id: { in: documents.map(({ id }) => id) }, deletedAt: null },
          data: { deletedAt: new Date() },
        })
      : { count: 0 };
    await this.prisma.sellerProfile.updateMany({
      where: { userId },
      data: {
        kycIdType: null,
        kycIdNumberEncrypted: null,
        kycIdNumberLast4: null,
        kycApplicantFingerprint: null,
        kycNameMatch: null,
      },
    });
    return { deleted: result.count };
  }

  private async deleteReviewImages(userId: string): Promise<void> {
    const reviews = await this.prisma.review.findMany({
      where: { userId, imagePublicId: { not: null } },
      select: { imagePublicId: true },
    });
    if (reviews.length && !this.configService.storage.cloudName) {
      throw new ServiceUnavailableException(
        'Review image storage is not configured; account erasure remains in progress',
      );
    }
    try {
      for (const review of reviews) {
        if (review.imagePublicId) await this.uploadService.deleteFile(review.imagePublicId);
      }
    } catch {
      throw new ServiceUnavailableException(
        'Review images could not be deleted; account erasure remains in progress',
      );
    }
  }

  private async deleteSupportMedia(userId: string, statusFilter: Record<string, unknown>) {
    const tickets = await this.prisma.supportTicket.findMany({
      where: { userId, ...statusFilter },
      select: {
        attachments: true,
        privateAttachments: {
          where: { deletedAt: null },
          select: { id: true, storageKey: true, resourceType: true },
        },
      },
    });
    const publicIds = new Set<string>();
    const privateAttachments = new Map<
      string,
      { id: string; storageKey: string; resourceType: string }
    >();
    for (const ticket of tickets) {
      if (Array.isArray(ticket.attachments)) {
        for (const attachment of ticket.attachments) {
          if (
            attachment &&
            typeof attachment === 'object' &&
            'publicId' in attachment &&
            typeof attachment.publicId === 'string'
          ) {
            publicIds.add(attachment.publicId);
          }
        }
      }
      for (const attachment of ticket.privateAttachments ?? []) {
        privateAttachments.set(attachment.id, attachment);
      }
    }
    if (!publicIds.size && !privateAttachments.size) return;
    if (!this.configService.storage.cloudName) {
      throw new ServiceUnavailableException(
        'Support media storage is not configured; the request remains in progress',
      );
    }
    for (const publicId of publicIds) {
      try {
        await this.uploadService.deleteFile(publicId);
      } catch {
        throw new ServiceUnavailableException(
          'Support media could not be deleted; the request remains in progress',
        );
      }
    }
    try {
      for (const attachment of privateAttachments.values()) {
        await this.uploadService.deletePrivateSupportAttachment(
          attachment.storageKey,
          attachment.resourceType,
        );
      }
    } catch {
      throw new ServiceUnavailableException(
        'Private support attachments could not be deleted; the request remains in progress',
      );
    }
    if (privateAttachments.size) {
      await this.prisma.supportTicketAttachment.updateMany({
        where: { id: { in: [...privateAttachments.keys()] }, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    }
  }

  private async eraseNonretainedData(
    requestId: string,
    userId: string,
    retainedCategories: string[],
  ) {
    const retained = new Set(retainedCategories);
    await this.prisma.$transaction(async (tx) => {
      const reviews = await tx.review.findMany({ where: { userId }, select: { productId: true } });
      const votes = await tx.reviewHelpfulVote.groupBy({
        by: ['reviewId'],
        where: { userId },
        _count: { _all: true },
      });
      for (const vote of votes) {
        await tx.review.updateMany({
          where: { id: vote.reviewId },
          data: { helpfulCount: { decrement: vote._count._all } },
        });
      }
      await tx.review.updateMany({
        where: { sellerReplyById: userId },
        data: { sellerReply: null, sellerReplyAt: null, sellerReplyById: null },
      });
      await tx.review.deleteMany({ where: { userId } });
      for (const productId of new Set(reviews.map((review) => review.productId))) {
        const stats = await tx.review.aggregate({
          where: { productId, deletedAt: null, status: 'approved' },
          _avg: { rating: true },
          _count: { _all: true },
        });
        await tx.product.updateMany({
          where: { id: productId },
          data: {
            rating: stats._avg.rating ? Math.round(stats._avg.rating * 10) / 10 : 0,
            reviewCount: stats._count._all,
          },
        });
      }

      await tx.address.deleteMany({ where: { userId } });
      await tx.cart.deleteMany({ where: { userId } });
      await tx.wishlistItem.deleteMany({ where: { userId } });
      await tx.notification.deleteMany({ where: { userId } });
      await tx.notificationDevice.deleteMany({ where: { userId } });
      await tx.recentlyViewed.deleteMany({ where: { userId } });
      await tx.otp.deleteMany({ where: { userId } });
      await tx.sellerFollower.deleteMany({ where: { userId } });
      await tx.checkoutSession.deleteMany({ where: { userId } });
      if (!retained.has(DataRetentionCategory.AUTH_EVENTS))
        await tx.authEvent.deleteMany({ where: { userId } });
      if (!retained.has(DataRetentionCategory.SUPPORT_TICKETS)) {
        await tx.supportTicket.deleteMany({ where: { userId } });
      } else {
        await tx.supportTicket.deleteMany({ where: { userId, status: { not: 'open' } } });
      }
      if (!retained.has(DataRetentionCategory.WALLET_RECORDS))
        await tx.wallet.deleteMany({ where: { userId } });
      if (!retained.has(DataRetentionCategory.REWARDS_RECORDS))
        await tx.rewardsAccount.deleteMany({ where: { userId } });
      if (!retained.has(DataRetentionCategory.ORDERS_AND_RETURNS)) {
        await tx.order.deleteMany({ where: { userId } });
      } else {
        const retainedOrders = await tx.order.findMany({
          where: {
            userId,
            OR: [
              {
                status: {
                  in: ['pending_payment', 'confirmed', 'processing', 'shipped', 'refund_requested'],
                },
              },
              { paymentStatus: { in: ['paid', 'refunded'] } },
              { refundInProgressRequestId: { not: null } },
            ],
          },
          select: { id: true, status: true },
        });
        const openStatuses = [
          'pending_payment',
          'confirmed',
          'processing',
          'shipped',
          'refund_requested',
        ];
        const settledOrderIds = retainedOrders
          .filter((order) => !openStatuses.includes(order.status))
          .map((order) => order.id);
        if (settledOrderIds.length) {
          await tx.order.updateMany({
            where: { id: { in: settledOrderIds } },
            data: {
              deliveryAddress: {},
              pickupDetails: Prisma.DbNull,
              guestEmail: null,
              guestPhone: null,
              tracking: [],
              timeline: [],
            },
          });
        }
        await tx.order.deleteMany({
          where: { userId, id: { notIn: retainedOrders.map((order) => order.id) } },
        });
        const retainedReturns = await tx.returnRequest.findMany({
          where: {
            userId,
            OR: [
              { status: { in: ['pending', 'approved'] } },
              { refundReference: { not: null } },
              { refundAmount: { gt: 0 } },
              { refundProviderId: { not: null } },
            ],
          },
          select: { id: true, status: true },
        });
        await tx.returnRequest.deleteMany({
          where: { userId, id: { notIn: retainedReturns.map((item) => item.id) } },
        });
        await tx.returnRequest.updateMany({
          where: {
            userId,
            id: {
              in: retainedReturns
                .filter((item) => item.status === 'completed')
                .map((item) => item.id),
            },
          },
          data: {
            reason: 'Account deletion',
            description: null,
            evidenceUrls: [],
            sellerDecisionNote: null,
            adminOverrideNote: null,
          },
        });
      }

      await tx.user.update({
        where: { id: userId },
        data: {
          firstName: 'Deleted',
          lastName: 'Buyer',
          email: null,
          password: null,
          authProvider: AuthProvider.LOCAL,
          clerkId: null,
          phoneNumber: null,
          isPhoneVerified: false,
          dateOfBirth: null,
          gender: null,
          avatarUrl: null,
          avatarPublicId: null,
          isVerified: false,
          isActive: false,
          isTwoFactorEnabled: false,
          termsAcceptedAt: null,
          lastLoginAt: null,
          marketingConsentAt: null,
          refreshToken: null,
          deletedAt: new Date(),
          notificationPreferences: {
            orderUpdates: false,
            promotions: false,
            newsletter: false,
            securityAlerts: false,
          },
        },
      });

      if (!retained.size) {
        await tx.user.delete({ where: { id: userId } });
        await tx.dataRequest.update({ where: { id: requestId }, data: { userId: null } });
        await tx.dataRequest.update({
          where: { id: requestId },
          data: {
            status: DataRequestStatus.COMPLETED,
            completedAt: new Date(),
            processingStartedAt: null,
          },
        });
      } else {
        await tx.dataRequest.update({
          where: { id: requestId },
          data: { status: DataRequestStatus.IN_PROGRESS, processingStartedAt: null },
        });
      }
    });

    const refreshed = await this.prisma.dataRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (refreshed.status === DataRequestStatus.COMPLETED) await this.sendCompletionEmail(requestId);
    else await this.sendDecisionEmail(refreshed, 'in progress');
  }

  private async purgeCategory(tx: any, userId: string, category: DataRetentionCategory) {
    switch (category) {
      case DataRetentionCategory.ORDERS_AND_RETURNS:
        await tx.order.deleteMany({ where: { userId } });
        break;
      case DataRetentionCategory.SUPPORT_TICKETS:
        await tx.supportTicket.deleteMany({ where: { userId } });
        break;
      case DataRetentionCategory.WALLET_RECORDS:
        await tx.wallet.deleteMany({ where: { userId } });
        break;
      case DataRetentionCategory.REWARDS_RECORDS:
        await tx.rewardsAccount.deleteMany({ where: { userId } });
        break;
      case DataRetentionCategory.AUTH_EVENTS:
        await tx.authEvent.deleteMany({ where: { userId } });
        break;
    }
  }

  private async getRequestStatus(id: string) {
    const request = await this.prisma.dataRequest.findUniqueOrThrow({
      where: { id },
      include: { retentionItems: { orderBy: { retainUntil: 'asc' } } },
    });
    return {
      id: request.id,
      status: request.status,
      processedAt: request.processedAt,
      completedAt: request.completedAt,
      retentionItems: request.retentionItems.map(
        ({ category, lawfulBasis, purpose, retainUntil, purgedAt }) => ({
          category,
          lawfulBasis,
          purpose,
          retainUntil,
          purgedAt,
        }),
      ),
    };
  }

  private async sendDecisionEmail(
    request: { id: string; requesterEmail: string | null; requesterPhone?: string | null },
    decision: string,
    notes?: string | null,
  ) {
    const body =
      decision === 'rejected'
        ? `Your account deletion request was rejected.${notes ? ` Reason: ${notes}` : ''}`
        : 'Your account identity and nonessential profile data have been erased. Some records remain restricted for the stated purpose until their listed retention date, after which they will be deleted.';
    const sent = await this.sendNotice(
      request,
      decision === 'rejected' ? 'Deletion request update' : 'Deletion request is in progress',
      body,
    );
    if (sent) {
      await this.prisma.dataRequest.update({
        where: { id: request.id },
        data: {
          responseSentAt: new Date(),
          ...(decision === 'rejected' ? { requesterEmail: null, requesterPhone: null } : {}),
        },
      });
    }
  }

  private async sendCompletionEmail(id: string) {
    const request = await this.prisma.dataRequest.findUnique({ where: { id } });
    if (!request) return;
    const sent = await this.sendNotice(
      request,
      'Account deletion completed',
      'The remaining records covered by your deletion request have now been deleted.',
    );
    if (sent) {
      await this.prisma.dataRequest.update({
        where: { id },
        data: { responseSentAt: new Date(), requesterEmail: null, requesterPhone: null },
      });
    }
  }

  private async sendNotice(
    request: { requesterEmail: string | null; requesterPhone?: string | null },
    title: string,
    body: string,
  ): Promise<boolean> {
    if (request.requesterEmail) {
      return this.emailService.sendNotificationEmail({ to: request.requesterEmail, title, body });
    }
    if (request.requesterPhone)
      return this.smsService.send(request.requesterPhone, `${title}: ${body}`);
    return false;
  }
}
