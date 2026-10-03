// ============================================================
// Transfer State Machine
// ============================================================

export type TransferStatus =
  | 'CREATED'
  | 'PROCESSING'
  | 'DEBITED'
  | 'CREDITED'
  | 'COMPLETED'
  | 'FAILED';

// Valid transitions only
export const VALID_TRANSITIONS: Record<TransferStatus, TransferStatus[]> = {
  CREATED: ['PROCESSING', 'FAILED'],
  PROCESSING: ['DEBITED', 'FAILED'],
  DEBITED: ['CREDITED', 'FAILED'],
  CREDITED: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
};

export function isValidTransition(from: TransferStatus, to: TransferStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

// ============================================================
// Event Types
// ============================================================

export type EventType =
  | 'transfer.created'
  | 'transfer.completed'
  | 'transfer.failed'
  | 'transfer.processing'
  | 'transfer.debited'
  | 'transfer.credited';

export interface BaseEvent {
  eventId: string;
  eventType: EventType;
  aggregateId: string;  // transferId
  timestamp: string;    // ISO8601
  correlationId: string;
  payload: Record<string, unknown>;
}

export interface TransferCreatedEvent extends BaseEvent {
  eventType: 'transfer.created';
  payload: {
    transferId: string;
    sourceAccountId: string;
    destinationAccountId: string;
    amount: number;       // integer minor units
    currency: string;
    description: string;
    initiatedByUserId: string;
  };
}

export interface TransferCompletedEvent extends BaseEvent {
  eventType: 'transfer.completed';
  payload: {
    transferId: string;
    sourceAccountId: string;
    destinationAccountId: string;
    amount: number;
    currency: string;
  };
}

export interface TransferFailedEvent extends BaseEvent {
  eventType: 'transfer.failed';
  payload: {
    transferId: string;
    reason: string;
    sourceAccountId: string;
    destinationAccountId: string;
    amount: number;
    currency: string;
  };
}

export type DomainEvent = TransferCreatedEvent | TransferCompletedEvent | TransferFailedEvent;

// ============================================================
// RabbitMQ Exchange / Queue names
// ============================================================

export const EXCHANGE_NAME = 'banking.events';
export const EXCHANGE_TYPE = 'topic' as const;

export const QUEUES = {
  NOTIFICATION: 'notification.worker',
  AUDIT: 'audit.worker',
} as const;

export const ROUTING_KEYS = {
  TRANSFER_CREATED: 'transfer.created',
  TRANSFER_COMPLETED: 'transfer.completed',
  TRANSFER_FAILED: 'transfer.failed',
  TRANSFER_ALL: 'transfer.*',
} as const;

// ============================================================
// API Contracts (shared request/response shapes)
// ============================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    requestId: string;
    correlationId: string;
    timestamp: string;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================================
// Account types
// ============================================================

export type AccountStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
export type AccountType = 'SAVINGS' | 'CURRENT';

// ============================================================
// Ledger entry types
// ============================================================

export type LedgerEntryType = 'CREDIT' | 'DEBIT';
