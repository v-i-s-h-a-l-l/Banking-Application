import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getPrisma } from './db.js';
import {
  InvalidCredentialsError,
  AccountLockedError,
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  ValidationError,
} from '@banking/errors';
import { createLogger } from '@banking/logger';
import type { RegisterInput, LoginInput } from './validators.js';

const logger = createLogger('auth-service:service');

const SALT_ROUNDS = 10;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MINUTES = 15;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  createdAt: Date;
}

export async function registerUser(input: RegisterInput): Promise<UserProfile> {
  const prisma = getPrisma();

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ConflictError('Email already registered');
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      isActive: true,
      createdAt: true,
    },
  });

  try {
    const initialBalance = BigInt(1000000); // ₹10,000.00
    const ts = Date.now().toString().slice(-8);
    const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const accountNumber = `ACC${ts}${rand}`;

    await prisma.account.create({
      data: {
        userId: user.id,
        accountNumber,
        accountType: 'SAVINGS',
        currency: 'INR',
        balanceMinor: initialBalance,
        ledgerEntries: {
          create: {
            entryType: 'CREDIT',
            amountMinor: initialBalance,
            balanceAfter: initialBalance,
            description: 'Welcome Deposit',
          },
        },
      },
    });
  } catch (err) {
    logger.warn({ err, userId: user.id }, 'Could not auto-create initial account');
  }

  logger.info({ userId: user.id, email: user.email }, 'User registered');
  return user;
}

export async function validateCredentials(
  input: LoginInput,
  ipAddress?: string,
): Promise<UserProfile> {
  const prisma = getPrisma();

  const user = await prisma.user.findUnique({ where: { email: input.email } });

  if (!user || !user.isActive) {
    // Avoid user enumeration — same error
    throw new InvalidCredentialsError();
  }

  // Check for lockout: more than MAX_FAILED_ATTEMPTS in the window
  const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60 * 1000);
  const recentFailures = await prisma.loginAttempt.count({
    where: {
      userId: user.id,
      success: false,
      createdAt: { gte: windowStart },
    },
  });

  if (recentFailures >= MAX_FAILED_ATTEMPTS) {
    logger.warn({ userId: user.id }, 'Account locked due to too many failed attempts');
    throw new AccountLockedError();
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);

  // Record attempt
  await prisma.loginAttempt.create({
    data: { userId: user.id, success: valid, ipAddress },
  });

  if (!valid) {
    throw new InvalidCredentialsError();
  }

  logger.info({ userId: user.id }, 'User authenticated');
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

export async function createSession(
  userId: string,
  refreshToken: string,
  expiresAt: Date,
  ipAddress?: string,
  userAgent?: string,
): Promise<void> {
  const prisma = getPrisma();
  await prisma.session.create({
    data: { userId, refreshToken, expiresAt, ipAddress, userAgent },
  });
}

export async function rotateSession(
  oldRefreshToken: string,
  newRefreshToken: string,
  newExpiresAt: Date,
): Promise<string> {
  const prisma = getPrisma();

  const session = await prisma.session.findUnique({
    where: { refreshToken: oldRefreshToken },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  // Revoke old, create new
  await prisma.$transaction([
    prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    }),
    prisma.session.create({
      data: {
        userId: session.userId,
        refreshToken: newRefreshToken,
        expiresAt: newExpiresAt,
      },
    }),
  ]);

  return session.userId;
}

export async function revokeSession(refreshToken: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.session.updateMany({
    where: { refreshToken, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getUserById(userId: string): Promise<UserProfile> {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (!user) throw new NotFoundError('User');
  return user;
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const prisma = getPrisma();

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new ValidationError('Current password is incorrect', {});

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  logger.info({ userId }, 'Password changed');
}
