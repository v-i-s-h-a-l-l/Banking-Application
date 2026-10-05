export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'INSUFFICIENT_FUNDS'
  | 'ACCOUNT_LOCKED'
  | 'INVALID_CREDENTIALS'
  | 'TOKEN_EXPIRED'
  | 'DUPLICATE_REQUEST'
  | 'INVALID_TRANSFER_STATE'
  | 'ACCOUNT_INACTIVE';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number,
    code: ErrorCode,
    details?: unknown,
    isOperational = true,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class InsufficientFundsError extends AppError {
  constructor() {
    super('Insufficient funds', 422, 'INSUFFICIENT_FUNDS');
    this.name = 'InsufficientFundsError';
  }
}

export class AccountLockedError extends AppError {
  constructor() {
    super('Account is locked due to too many failed login attempts', 423, 'ACCOUNT_LOCKED');
    this.name = 'AccountLockedError';
  }
}

export class InvalidCredentialsError extends AppError {
  constructor() {
    super('Invalid credentials', 401, 'INVALID_CREDENTIALS');
    this.name = 'InvalidCredentialsError';
  }
}

export class DuplicateRequestError extends AppError {
  constructor() {
    super('Duplicate request with same idempotency key', 409, 'DUPLICATE_REQUEST');
    this.name = 'DuplicateRequestError';
  }
}

export class InvalidTransferStateError extends AppError {
  constructor(from: string, to: string) {
    super(`Invalid state transition: ${from} → ${to}`, 422, 'INVALID_TRANSFER_STATE');
    this.name = 'InvalidTransferStateError';
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(service: string) {
    super(`${service} is unavailable`, 503, 'SERVICE_UNAVAILABLE');
    this.name = 'ServiceUnavailableError';
  }
}

export class AccountInactiveError extends AppError {
  constructor() {
    super('Account is inactive', 422, 'ACCOUNT_INACTIVE');
    this.name = 'AccountInactiveError';
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export function toHttpError(err: unknown): {
  statusCode: number;
  code: ErrorCode | 'INTERNAL_ERROR';
  message: string;
  details?: unknown;
} {
  if (isAppError(err)) {
    return {
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
      details: err.details,
    };
  }
  const realMessage = (err as Error)?.message || 'An unexpected error occurred';
  return {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: realMessage,
    details: (err as any)?.meta || (err as any)?.code || undefined,
  };
}
