"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const passwordReset_1 = require("./passwordReset");
function fakeDatabase(user) {
    const tokens = [];
    const state = { passwordHash: 'old-hash', mustChangePassword: true, sessionVersion: 0 };
    let nextId = 1;
    const passwordResetToken = {
        async deleteMany({ where }) {
            const before = tokens.length;
            for (let index = tokens.length - 1; index >= 0; index--)
                if (where.tokenHash === tokens[index].tokenHash || where.expiresAt?.lt && tokens[index].expiresAt < where.expiresAt.lt)
                    tokens.splice(index, 1);
            return { count: before - tokens.length };
        },
        async create({ data }) { const token = { id: `token-${nextId++}`, usedAt: null, ...data }; tokens.push(token); return { id: token.id }; },
        async findUnique({ where }) { const token = tokens.find(item => item.tokenHash === where.tokenHash); return token ? { ...token, user: { isActive: user?.isActive ?? false } } : null; },
        async updateMany({ where, data }) {
            let count = 0;
            for (const token of tokens) {
                if (where.id && token.id !== where.id)
                    continue;
                if (where.userId && token.userId !== where.userId)
                    continue;
                if (where.usedAt === null && token.usedAt !== null)
                    continue;
                if (where.expiresAt?.gt && token.expiresAt <= where.expiresAt.gt)
                    continue;
                Object.assign(token, data);
                count++;
            }
            return { count };
        },
    };
    const db = {
        passwordResetToken,
        user: {
            async findUnique() { return user; },
            async updateMany({ where, data }) { if (!user || where.id !== user.id || where.isActive && !user.isActive)
                return { count: 0 }; state.passwordHash = data.passwordHash; state.mustChangePassword = data.mustChangePassword; state.sessionVersion += data.sessionVersion.increment; return { count: 1 }; },
        },
    };
    db.$transaction = async (callback) => callback(db);
    return { db: db, tokens, state };
}
(0, vitest_1.describe)('password reset security', () => {
    (0, vitest_1.it)('creates high-entropy tokens, stores a stable hash, and puts the raw token in a URL fragment', () => {
        const first = (0, passwordReset_1.createResetToken)(new Date('2026-09-01T00:00:00Z'));
        const second = (0, passwordReset_1.createResetToken)(new Date('2026-09-01T00:00:00Z'));
        (0, vitest_1.expect)(first.token).not.toBe(second.token);
        (0, vitest_1.expect)(first.tokenHash).toBe((0, passwordReset_1.hashResetToken)(first.token));
        (0, vitest_1.expect)(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
        const url = new URL((0, passwordReset_1.resetUrl)('https://fleetpilot.example/reset-password', first.token));
        (0, vitest_1.expect)(url.search).toBe('');
        (0, vitest_1.expect)(new URLSearchParams(url.hash.slice(1)).get('token')).toBe(first.token);
    });
    (0, vitest_1.it)('issues only a hashed token for an active user and sends the raw value only through the mailer', async () => {
        const { db, tokens } = fakeDatabase({ id: 'user-1', name: 'Owner', email: 'OWNER@example.com', isActive: true });
        const sentMessages = [];
        const mailer = vitest_1.vi.fn(async (input) => { sentMessages.push(input); });
        const service = new passwordReset_1.PasswordResetService(db, 'https://fleetpilot.example/reset-password', mailer);
        (0, vitest_1.expect)(await service.request(' owner@example.com ')).toBe('user-1');
        (0, vitest_1.expect)(tokens).toHaveLength(1);
        (0, vitest_1.expect)(tokens[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
        const sentUrl = new URL(sentMessages[0].resetUrl);
        const rawToken = new URLSearchParams(sentUrl.hash.slice(1)).get('token');
        (0, vitest_1.expect)(tokens[0].tokenHash).toBe((0, passwordReset_1.hashResetToken)(rawToken));
        (0, vitest_1.expect)(tokens[0].tokenHash).not.toContain(rawToken);
    });
    (0, vitest_1.it)('does not create a token or send mail for an unknown account', async () => {
        const { db, tokens } = fakeDatabase(null);
        const mailer = vitest_1.vi.fn(async () => undefined);
        (0, vitest_1.expect)(await new passwordReset_1.PasswordResetService(db, 'https://fleetpilot.example/reset-password', mailer).request('missing@example.com')).toBeNull();
        (0, vitest_1.expect)(tokens).toHaveLength(0);
        (0, vitest_1.expect)(mailer).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('invalidates an earlier unused link when a new link is requested', async () => {
        const { db, tokens } = fakeDatabase({ id: 'user-1', name: 'Owner', email: 'owner@example.com', isActive: true });
        const service = new passwordReset_1.PasswordResetService(db, 'https://fleetpilot.example/reset-password', async () => undefined);
        await service.request('owner@example.com');
        await service.request('owner@example.com');
        (0, vitest_1.expect)(tokens).toHaveLength(2);
        (0, vitest_1.expect)(tokens[0].usedAt).toBeInstanceOf(Date);
        (0, vitest_1.expect)(tokens[1].usedAt).toBeNull();
    });
    (0, vitest_1.it)('sets a password, consumes all links, and increments the session version', async () => {
        const { db, tokens, state } = fakeDatabase({ id: 'user-1', name: 'Owner', email: 'owner@example.com', isActive: true });
        const service = new passwordReset_1.PasswordResetService(db, 'https://fleetpilot.example/reset-password', async () => undefined);
        await service.request('owner@example.com');
        const rawToken = (0, passwordReset_1.createResetToken)().token;
        tokens[0].tokenHash = (0, passwordReset_1.hashResetToken)(rawToken);
        await service.reset(rawToken, 'NewPassword123');
        (0, vitest_1.expect)(await bcryptjs_1.default.compare('NewPassword123', state.passwordHash)).toBe(true);
        (0, vitest_1.expect)(state.mustChangePassword).toBe(false);
        (0, vitest_1.expect)(state.sessionVersion).toBe(1);
        (0, vitest_1.expect)(tokens[0].usedAt).toBeInstanceOf(Date);
        await (0, vitest_1.expect)(service.reset(rawToken, 'AnotherPassword123')).rejects.toBeInstanceOf(passwordReset_1.InvalidResetTokenError);
    });
    (0, vitest_1.it)('rejects expired and suspended-account links', async () => {
        const expired = fakeDatabase({ id: 'user-1', name: 'Owner', email: 'owner@example.com', isActive: true });
        expired.tokens.push({ id: 'old', userId: 'user-1', tokenHash: (0, passwordReset_1.hashResetToken)('expired-token'), expiresAt: new Date(Date.now() - 1), usedAt: null });
        await (0, vitest_1.expect)(new passwordReset_1.PasswordResetService(expired.db, 'https://fleetpilot.example/reset-password').reset('expired-token', 'NewPassword123')).rejects.toBeInstanceOf(passwordReset_1.InvalidResetTokenError);
        const suspended = fakeDatabase({ id: 'user-2', name: 'Owner', email: 'owner2@example.com', isActive: false });
        suspended.tokens.push({ id: 'suspended', userId: 'user-2', tokenHash: (0, passwordReset_1.hashResetToken)('suspended-token'), expiresAt: new Date(Date.now() + 60_000), usedAt: null });
        await (0, vitest_1.expect)(new passwordReset_1.PasswordResetService(suspended.db, 'https://fleetpilot.example/reset-password').reset('suspended-token', 'NewPassword123')).rejects.toBeInstanceOf(passwordReset_1.InvalidResetTokenError);
    });
    (0, vitest_1.it)('allows only one of two concurrent submissions to consume a link', async () => {
        const { db, tokens } = fakeDatabase({ id: 'user-1', name: 'Owner', email: 'owner@example.com', isActive: true });
        const service = new passwordReset_1.PasswordResetService(db, 'https://fleetpilot.example/reset-password', async () => undefined);
        const rawToken = 'one-concurrent-reset-token-that-is-long-enough';
        tokens.push({ id: 'concurrent', userId: 'user-1', tokenHash: (0, passwordReset_1.hashResetToken)(rawToken), expiresAt: new Date(Date.now() + 60_000), usedAt: null });
        const results = await Promise.allSettled([service.reset(rawToken, 'NewPassword123'), service.reset(rawToken, 'NewPassword123')]);
        (0, vitest_1.expect)(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        (0, vitest_1.expect)(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    });
    (0, vitest_1.it)('removes a newly issued token when email delivery fails', async () => {
        const { db, tokens } = fakeDatabase({ id: 'user-1', name: 'Owner', email: 'owner@example.com', isActive: true });
        const service = new passwordReset_1.PasswordResetService(db, 'https://fleetpilot.example/reset-password', async () => { throw new Error('mail unavailable'); });
        await (0, vitest_1.expect)(service.request('owner@example.com')).rejects.toThrow('mail unavailable');
        (0, vitest_1.expect)(tokens).toHaveLength(0);
    });
});
