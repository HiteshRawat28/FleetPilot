"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const routePlanning_1 = require("./routePlanning");
(0, vitest_1.afterEach)(() => {
    vitest_1.vi.unstubAllGlobals();
    vitest_1.vi.unstubAllEnvs();
});
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
(0, vitest_1.describe)('fallbackEstimatedRoute', () => {
    (0, vitest_1.it)('returns a usable estimated route when verified providers are unavailable', () => {
        const source = { id: 'built:bhopal', name: 'Bhopal', label: 'Bhopal, Madhya Pradesh', state: 'Madhya Pradesh', latitude: 23.2599, longitude: 77.4126, provider: 'BUILT_IN' };
        const destination = { id: 'built:ahmedabad', name: 'Ahmedabad', label: 'Ahmedabad, Gujarat', state: 'Gujarat', latitude: 23.0225, longitude: 72.5714, provider: 'BUILT_IN' };
        const route = (0, routePlanning_1.fallbackEstimatedRoute)(source, destination);
        (0, vitest_1.expect)(route.provider).toBe('ESTIMATED');
        (0, vitest_1.expect)(route.tollEstimateStatus).toBe('UNAVAILABLE');
        (0, vitest_1.expect)(route.estimatedToll).toBeNull();
        (0, vitest_1.expect)(route.distanceKm).toBeGreaterThan(500);
        (0, vitest_1.expect)(route.durationMinutes).toBeGreaterThan(600);
    });
});
(0, vitest_1.describe)('estimateRoutes', () => {
    (0, vitest_1.it)('falls back to coordinate estimates when external route providers return 503', async () => {
        vitest_1.vi.stubEnv('GOOGLE_MAPS_API_KEY', 'test-key');
        vitest_1.vi.stubGlobal('fetch', vitest_1.vi.fn(async () => new Response(null, { status: 503 })));
        const source = { id: 'built:bhopal', name: 'Bhopal', label: 'Bhopal, Madhya Pradesh', state: 'Madhya Pradesh', latitude: 23.2599, longitude: 77.4126, provider: 'BUILT_IN' };
        const destination = { id: 'built:ahmedabad', name: 'Ahmedabad', label: 'Ahmedabad, Gujarat', state: 'Gujarat', latitude: 23.0225, longitude: 72.5714, provider: 'BUILT_IN' };
        const result = await (0, routePlanning_1.estimateRoutes)(source, destination);
        (0, vitest_1.expect)(result.options).toHaveLength(1);
        (0, vitest_1.expect)(result.options[0]).toMatchObject({
            provider: 'ESTIMATED',
            tollEstimateStatus: 'UNAVAILABLE',
            estimatedToll: null,
            recommended: true
        });
    });
});
