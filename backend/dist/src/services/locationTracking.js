"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackingStatus = trackingStatus;
exports.locationTimestampBelongsToDispatch = locationTimestampBelongsToDispatch;
const client_1 = require("@prisma/client");
function trackingStatus(tripStatus, capturedAt, nowMs = Date.now()) {
    if (tripStatus === client_1.TripStatus.COMPLETED || tripStatus === client_1.TripStatus.CANCELLED)
        return 'ENDED';
    if (!capturedAt)
        return 'WAITING_FOR_GPS';
    const ageSeconds = Math.max(0, (nowMs - capturedAt.getTime()) / 1000);
    if (ageSeconds <= 30)
        return 'LIVE';
    if (ageSeconds <= 120)
        return 'DELAYED';
    return 'OFFLINE';
}
function locationTimestampBelongsToDispatch(capturedAt, dispatchStartedAt, nowMs = Date.now()) {
    const clockToleranceMs = 5 * 60 * 1000;
    return capturedAt.getTime() >= dispatchStartedAt.getTime() - clockToleranceMs && capturedAt.getTime() <= nowMs + clockToleranceMs;
}
