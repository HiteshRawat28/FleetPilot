"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const client_1 = require("@prisma/client");
const locationTracking_1 = require("./locationTracking");
(0, vitest_1.describe)('trip live-location state', () => {
    const now = new Date('2026-09-01T12:00:00.000Z').getTime();
    (0, vitest_1.it)('waits for the first GPS fix', () => (0, vitest_1.expect)((0, locationTracking_1.trackingStatus)(client_1.TripStatus.DISPATCHED, null, now)).toBe('WAITING_FOR_GPS'));
    (0, vitest_1.it)('marks fresh points live', () => (0, vitest_1.expect)((0, locationTracking_1.trackingStatus)(client_1.TripStatus.IN_PROGRESS, new Date(now - 20_000), now)).toBe('LIVE'));
    (0, vitest_1.it)('marks temporarily delayed points', () => (0, vitest_1.expect)((0, locationTracking_1.trackingStatus)(client_1.TripStatus.IN_PROGRESS, new Date(now - 75_000), now)).toBe('DELAYED'));
    (0, vitest_1.it)('marks old points offline', () => (0, vitest_1.expect)((0, locationTracking_1.trackingStatus)(client_1.TripStatus.DISPATCHED, new Date(now - 121_000), now)).toBe('OFFLINE'));
    (0, vitest_1.it)('always ends tracking for terminal trips', () => (0, vitest_1.expect)((0, locationTracking_1.trackingStatus)(client_1.TripStatus.COMPLETED, new Date(now), now)).toBe('ENDED'));
    (0, vitest_1.it)('accepts only timestamps within the dispatch window and clock tolerance', () => {
        const dispatchedAt = new Date(now - 60_000);
        (0, vitest_1.expect)((0, locationTracking_1.locationTimestampBelongsToDispatch)(new Date(now - 45_000), dispatchedAt, now)).toBe(true);
        (0, vitest_1.expect)((0, locationTracking_1.locationTimestampBelongsToDispatch)(new Date(dispatchedAt.getTime() - 300_001), dispatchedAt, now)).toBe(false);
        (0, vitest_1.expect)((0, locationTracking_1.locationTimestampBelongsToDispatch)(new Date(now + 300_001), dispatchedAt, now)).toBe(false);
    });
});
