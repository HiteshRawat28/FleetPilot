"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const session_1 = require("./session");
(0, vitest_1.describe)('browser session security', () => {
    (0, vitest_1.it)('reads the named cookie without accepting similarly named cookies', () => (0, vitest_1.expect)((0, session_1.cookieValue)(`other=x; ${session_1.SESSION_COOKIE}=signed-token; ${session_1.SESSION_COOKIE}_old=bad`, session_1.SESSION_COOKIE)).toBe('signed-token'));
    (0, vitest_1.it)('keeps bearer authentication for API clients and gives it precedence', () => (0, vitest_1.expect)((0, session_1.sessionToken)({ authorization: 'Bearer api-token', cookie: `${session_1.SESSION_COOKIE}=cookie-token` })).toBe('api-token'));
    (0, vitest_1.it)('uses an HttpOnly, same-site cookie that is secure in production', () => {
        (0, vitest_1.expect)((0, session_1.sessionCookieOptions)(true)).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: true, path: '/api' });
        (0, vitest_1.expect)((0, session_1.sessionCookieOptions)(false).secure).toBe(false);
    });
    (0, vitest_1.it)('accepts legacy sessions only while the account is still on version zero', () => {
        (0, vitest_1.expect)((0, session_1.sessionVersionMatches)(undefined, 0)).toBe(true);
        (0, vitest_1.expect)((0, session_1.sessionVersionMatches)(undefined, 1)).toBe(false);
        (0, vitest_1.expect)((0, session_1.sessionVersionMatches)(2, 2)).toBe(true);
        (0, vitest_1.expect)((0, session_1.sessionVersionMatches)(1, 2)).toBe(false);
    });
});
