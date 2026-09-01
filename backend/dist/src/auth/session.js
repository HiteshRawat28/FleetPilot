"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_COOKIE = void 0;
exports.cookieValue = cookieValue;
exports.sessionToken = sessionToken;
exports.sessionVersionMatches = sessionVersionMatches;
exports.sessionCookieOptions = sessionCookieOptions;
exports.SESSION_COOKIE = 'fleetpilot_session';
function cookieValue(header, name) {
    if (!header)
        return undefined;
    for (const part of header.split(';')) {
        const separator = part.indexOf('=');
        if (separator < 0)
            continue;
        const key = part.slice(0, separator).trim();
        if (key === name)
            return decodeURIComponent(part.slice(separator + 1).trim());
    }
    return undefined;
}
function sessionToken(headers) {
    const bearer = headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    return bearer || cookieValue(headers.cookie, exports.SESSION_COOKIE);
}
function sessionVersionMatches(claimVersion, accountVersion) {
    return (typeof claimVersion === 'number' ? claimVersion : 0) === accountVersion;
}
function sessionCookieOptions(production) { return { httpOnly: true, sameSite: 'lax', secure: production, path: '/api', maxAge: 8 * 60 * 60 * 1000 }; }
