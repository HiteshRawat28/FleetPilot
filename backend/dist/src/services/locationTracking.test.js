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
    (0, vitest_1.it)('rejects mocked, inaccurate, or far-away location points', () => {
        const route = { sourceLatitude: 23.2599, sourceLongitude: 77.4126, destinationLatitude: 23.0225, destinationLongitude: 72.5714, plannedDistanceKm: 580 };
        (0, vitest_1.expect)((0, locationTracking_1.locationTrustProblem)({ latitude: 23.1, longitude: 75, accuracyM: 25, isMocked: false }, route)).toBeNull();
        (0, vitest_1.expect)((0, locationTracking_1.locationTrustProblem)({ latitude: 23.1, longitude: 75, accuracyM: 25, isMocked: true }, route)).toContain('Mock');
        (0, vitest_1.expect)((0, locationTracking_1.locationTrustProblem)({ latitude: 23.1, longitude: 75, accuracyM: 1200, isMocked: false }, route)).toContain('accuracy');
        (0, vitest_1.expect)((0, locationTracking_1.locationTrustProblem)({ latitude: 37.785834, longitude: -122.406417, accuracyM: 5, isMocked: false }, route)).toContain('supported India operating area');
        (0, vitest_1.expect)((0, locationTracking_1.locationTrustProblem)({ latitude: 28.61, longitude: 77.2, accuracyM: 5, isMocked: false }, route)).toContain('planned trip corridor');
    });
});
