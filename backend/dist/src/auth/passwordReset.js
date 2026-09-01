"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PasswordResetService = exports.InvalidResetTokenError = exports.INVALID_RESET_TOKEN_MESSAGE = exports.RESET_TOKEN_TTL_MINUTES = void 0;
exports.hashResetToken = hashResetToken;
exports.createResetToken = createResetToken;
exports.resetUrl = resetUrl;
const node_crypto_1 = require("node:crypto");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const email_1 = require("../services/email");
const configuredTtlMinutes = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 30);
exports.RESET_TOKEN_TTL_MINUTES = Number.isFinite(configuredTtlMinutes)
    ? Math.floor(Math.min(60, Math.max(10, configuredTtlMinutes)))
    : 30;
exports.INVALID_RESET_TOKEN_MESSAGE = 'This password-reset link is invalid or has expired. Request a new link.';
class InvalidResetTokenError extends Error {
    status = 400;
    code = 'RESET_TOKEN_INVALID';
    constructor() { super(exports.INVALID_RESET_TOKEN_MESSAGE); }
}
exports.InvalidResetTokenError = InvalidResetTokenError;
function hashResetToken(token) {
    return (0, node_crypto_1.createHash)('sha256').update(token).digest('hex');
}
function createResetToken(now = new Date()) {
    const token = (0, node_crypto_1.randomBytes)(32).toString('base64url');
    return {
        token,
        tokenHash: hashResetToken(token),
        expiresAt: new Date(now.getTime() + exports.RESET_TOKEN_TTL_MINUTES * 60_000),
    };
}
function resetUrl(baseUrl, token) {
    const url = new URL(baseUrl);
    url.hash = new URLSearchParams({ token }).toString();
    return url.toString();
}
class PasswordResetService {
    db;
    frontendResetUrl;
    mailer;
    constructor(db, frontendResetUrl, mailer = email_1.sendPasswordResetEmail) {
        this.db = db;
        this.frontendResetUrl = frontendResetUrl;
        this.mailer = mailer;
    }
    async request(email) {
        const normalizedEmail = email.trim().toLowerCase();
        const now = new Date();
        await this.db.passwordResetToken.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 24 * 60 * 60_000) } } });
        const user = await this.db.user.findUnique({ where: { email: normalizedEmail }, select: { id: true, name: true, email: true, isActive: true } });
        if (!user?.isActive)
            return null;
        const material = createResetToken(now);
        const record = await this.db.$transaction(async (transaction) => {
            await transaction.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
            return transaction.passwordResetToken.create({ data: { userId: user.id, tokenHash: material.tokenHash, expiresAt: material.expiresAt }, select: { id: true } });
        });
        try {
            await this.mailer({
                recipient: user.email,
                name: user.name,
                resetUrl: resetUrl(this.frontendResetUrl, material.token),
                expiresInMinutes: exports.RESET_TOKEN_TTL_MINUTES,
                idempotencyKey: `password-reset-${record.id}`,
            });
        }
        catch (error) {
            await this.db.passwordResetToken.deleteMany({ where: { tokenHash: material.tokenHash } });
            throw error;
        }
        return user.id;
    }
    async reset(token, password) {
        const tokenHash = hashResetToken(token);
        const now = new Date();
        const record = await this.db.passwordResetToken.findUnique({
            where: { tokenHash },
            select: { id: true, userId: true, expiresAt: true, usedAt: true, user: { select: { isActive: true } } },
        });
        if (!record || record.usedAt || record.expiresAt <= now || !record.user.isActive)
            throw new InvalidResetTokenError();
        const passwordHash = await bcryptjs_1.default.hash(password, 12);
        await this.db.$transaction(async (transaction) => {
            const claimed = await transaction.passwordResetToken.updateMany({
                where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
                data: { usedAt: now },
            });
            if (claimed.count !== 1)
                throw new InvalidResetTokenError();
            const updated = await transaction.user.updateMany({
                where: { id: record.userId, isActive: true },
                data: { passwordHash, mustChangePassword: false, sessionVersion: { increment: 1 } },
            });
            if (updated.count !== 1)
                throw new InvalidResetTokenError();
            await transaction.passwordResetToken.updateMany({
                where: { userId: record.userId, usedAt: null },
                data: { usedAt: now },
            });
        });
        return record.userId;
    }
}
exports.PasswordResetService = PasswordResetService;
