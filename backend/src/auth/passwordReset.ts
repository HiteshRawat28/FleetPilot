import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { sendPasswordResetEmail, type PasswordResetEmail } from '../services/email';

const configuredTtlMinutes = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 30);
export const RESET_TOKEN_TTL_MINUTES = Number.isFinite(configuredTtlMinutes)
  ? Math.floor(Math.min(60, Math.max(10, configuredTtlMinutes)))
  : 30;
export const INVALID_RESET_TOKEN_MESSAGE = 'This password-reset link is invalid or has expired. Request a new link.';

export class InvalidResetTokenError extends Error {
  readonly status = 400;
  readonly code = 'RESET_TOKEN_INVALID';
  constructor() { super(INVALID_RESET_TOKEN_MESSAGE); }
}

export function hashResetToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function createResetToken(now = new Date()) {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MINUTES * 60_000),
  };
}

export function resetUrl(baseUrl: string, token: string) {
  const url = new URL(baseUrl);
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}

type Mailer = (input: PasswordResetEmail) => Promise<void>;

export class PasswordResetService {
  constructor(
    private readonly db: PrismaClient,
    private readonly frontendResetUrl: string,
    private readonly mailer: Mailer = sendPasswordResetEmail,
  ) {}

  async request(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const now = new Date();
    await this.db.passwordResetToken.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 24 * 60 * 60_000) } } });
    const user = await this.db.user.findUnique({ where: { email: normalizedEmail }, select: { id: true, name: true, email: true, isActive: true } });
    if (!user?.isActive) return null;

    const material = createResetToken(now);
    const record = await this.db.$transaction(async transaction => {
      await transaction.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
      return transaction.passwordResetToken.create({ data: { userId: user.id, tokenHash: material.tokenHash, expiresAt: material.expiresAt }, select: { id: true } });
    });
    try {
      await this.mailer({
        recipient: user.email,
        name: user.name,
        resetUrl: resetUrl(this.frontendResetUrl, material.token),
        expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
        idempotencyKey: `password-reset-${record.id}`,
      });
    } catch (error) {
      await this.db.passwordResetToken.deleteMany({ where: { tokenHash: material.tokenHash } });
      throw error;
    }
    return user.id;
  }

  async reset(token: string, password: string) {
    const tokenHash = hashResetToken(token);
    const now = new Date();
    const record = await this.db.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true, usedAt: true, user: { select: { isActive: true } } },
    });
    if (!record || record.usedAt || record.expiresAt <= now || !record.user.isActive) throw new InvalidResetTokenError();

    const passwordHash = await bcrypt.hash(password, 12);
    await this.db.$transaction(async transaction => {
      const claimed = await transaction.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw new InvalidResetTokenError();
      const updated = await transaction.user.updateMany({
        where: { id: record.userId, isActive: true },
        data: { passwordHash, mustChangePassword: false, sessionVersion: { increment: 1 } },
      });
      if (updated.count !== 1) throw new InvalidResetTokenError();
      await transaction.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: now },
      });
    });
    return record.userId;
  }
}
