"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const routePlanning_1 = require("./routePlanning");
(0, vitest_1.describe)('parseGoogleTollInfo', () => {
    (0, vitest_1.it)('parses INR units and nanos without fixed toll multipliers', () => {
        (0, vitest_1.expect)((0, routePlanning_1.parseGoogleTollInfo)({ estimatedPrice: [{ currencyCode: 'INR', units: '1240', nanos: 500000000 }] })).toEqual({ estimatedToll: 1240.5, tollEstimateStatus: 'ESTIMATED' });
    });
    (0, vitest_1.it)('reports no expected toll when Google omits toll info', () => {
        (0, vitest_1.expect)((0, routePlanning_1.parseGoogleTollInfo)()).toEqual({ estimatedToll: 0, tollEstimateStatus: 'NO_TOLLS_EXPECTED' });
    });
    (0, vitest_1.it)('keeps tolls unknown when a toll exists without an INR price', () => {
        (0, vitest_1.expect)((0, routePlanning_1.parseGoogleTollInfo)({ estimatedPrice: [{ currencyCode: 'USD', units: '4' }] })).toEqual({ estimatedToll: null, tollEstimateStatus: 'TOLLS_PRESENT_PRICE_UNKNOWN' });
    });
});
(0, vitest_1.describe)('rankRouteMetrics', () => {
    (0, vitest_1.it)('labels candidates from their returned metrics instead of their requested strategy', () => {
        const requestedShortest = { name: 'requested-shortest', distanceKm: 786, durationMinutes: 907 };
        const requestedFastest = { name: 'requested-fastest', distanceKm: 1029, durationMinutes: 1224 };
        const requestedTollSaver = { name: 'requested-toll-saver', distanceKm: 795, durationMinutes: 917 };
        (0, vitest_1.expect)((0, routePlanning_1.rankRouteMetrics)([requestedShortest, requestedFastest, requestedTollSaver])).toEqual({
            shortest: requestedShortest,
            fastest: requestedShortest
        });
    });
});
