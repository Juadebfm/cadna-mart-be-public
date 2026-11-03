import { BaseSchema } from '@shared/base/base.schema';
export enum TicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  ESCALATED = 'escalated',
  CLOSED = 'closed',
}
export enum TicketCategory {
  ORDER = 'order',
  PAYMENT = 'payment',
  PAYOUT = 'payout',
  RETURNS = 'returns',
  ACCOUNT = 'account',
  PRODUCT = 'product',
  KYC_VERIFICATION = 'kyc_verification',
  OTHER = 'other',
}
export interface TicketMessage {
  id?: string;
  sequence?: number;
  clientMessageId?: string | null;
  authorId: string;
  authorRole: string;
  body: string;
  sentAt: Date;
}
export interface TicketAttachment {
  url: string;
  publicId: string;
}
export interface PrivateTicketAttachment {
  id: string;
  originalFileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
}
export class SupportTicket extends BaseSchema {
  userId!: string | null;
  accountType!: string;
  guestEmail!: string | null;
  subject!: string;
  body!: string;
  category!: TicketCategory;
  status!: TicketStatus;
  assignedTo!: string | null;
  messages!: TicketMessage[];
  orderId!: string | null;
  attachments!: TicketAttachment[];
  privateAttachments!: PrivateTicketAttachment[];
  closedAt!: Date | null;
  withdrawnAt!: Date | null;
}
