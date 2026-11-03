export enum DataRequestKind {
  EXPORT = 'export',
  DELETE = 'delete',
}

export enum DataRequestSource {
  BUYER = 'buyer',
  ADMIN = 'admin',
  CLERK = 'clerk',
}
export enum DataRequestStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  REJECTED = 'rejected',
}

export enum DataRetentionCategory {
  ORDERS_AND_RETURNS = 'orders_and_returns',
  SUPPORT_TICKETS = 'support_tickets',
  WALLET_RECORDS = 'wallet_records',
  REWARDS_RECORDS = 'rewards_records',
  AUTH_EVENTS = 'auth_events',
}

export class DataRequest {
  userId!: string | null;
  kind!: DataRequestKind;
  source!: DataRequestSource;
  status!: DataRequestStatus;
  processedBy!: string | null;
  processedAt!: Date | null;
  completedAt!: Date | null;
  responseDueAt!: Date | null;
  requesterEmail!: string | null;
  requesterPhone!: string | null;
  decisionNotes!: string | null;
  notes!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}
