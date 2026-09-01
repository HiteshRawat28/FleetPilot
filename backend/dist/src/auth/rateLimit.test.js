"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const rateLimit_1 = require("./rateLimit");
(0, vitest_1.describe)('public auth rate limiting', () => {
    (0, vitest_1.it)('hashes normalized email keys instead of retaining addresses', () => {
        (0, vitest_1.expect)((0, rateLimit_1.privacyHash)(' Owner@Example.com ')).toBe((0, rateLimit_1.privacyHash)('owner@example.com'));
        (0, vitest_1.expect)((0, rateLimit_1.privacyHash)('owner@example.com')).not.toContain('owner@example.com');
    });
    (0, vitest_1.it)('returns 429 after the configured request count', () => {
        const middleware = (0, rateLimit_1.createRateLimit)({ windowMs: 60_000, max: 2, key: () => 'one-client' });
        const next = vitest_1.vi.fn();
        const response = { setHeader: vitest_1.vi.fn(), status: vitest_1.vi.fn(), json: vitest_1.vi.fn() };
        response.status.mockReturnValue(response);
        const request = {};
        middleware(request, response, next);
        middleware(request, response, next);
        middleware(request, response, next);
        (0, vitest_1.expect)(next).toHaveBeenCalledTimes(2);
        (0, vitest_1.expect)(response.status).toHaveBeenCalledWith(429);
        (0, vitest_1.expect)(response.json).toHaveBeenCalledWith({ message: 'Too many requests. Please try again later.' });
    });
});
