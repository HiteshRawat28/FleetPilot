"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const historicalTollEstimate_1 = require("./historicalTollEstimate");
const source = { id: 'a', name: 'Ahmedabad', label: 'Ahmedabad, Gujarat', city: 'Ahmedabad', state: 'Gujarat', latitude: 23, longitude: 72, provider: 'BUILT_IN' };
const destination = { id: 's', name: 'Surat', label: 'Surat, Gujarat', city: 'Surat', state: 'Gujarat', latitude: 21, longitude: 73, provider: 'BUILT_IN' };
(0, vitest_1.describe)('historical toll estimation', () => {
    (0, vitest_1.it)('prefers same-corridor observations and weights the rate by distance', () => {
        const result = (0, historicalTollEstimate_1.estimateHistoricalToll)({ source, destination, distanceKm: 300, vehicleClass: 'LCV', observations: [
                { source: 'Ahmedabad Depot, Gujarat', destination: 'Surat Hub, Gujarat', distanceKm: 250, tollAmountInr: 1000, vehicleClass: 'LCV', observedAt: '2026-08-01' },
                { source: 'Surat', destination: 'Ahmedabad', distanceKm: 250, tollAmountInr: 1250, vehicleClass: 'LCV', observedAt: '2026-08-20' },
                { source: 'Jaipur', destination: 'Ajmer', distanceKm: 130, tollAmountInr: 900, vehicleClass: 'LCV', observedAt: '2026-08-30' }
            ] });
        (0, vitest_1.expect)(result).toMatchObject({ estimatedTollInr: 1350, ratePerKmInr: 4.5, source: 'HISTORICAL_CORRIDOR', confidence: 'MEDIUM', sampleSize: 2 });
    });
    (0, vitest_1.it)('uses same-class fleet history at low confidence and never invents an empty estimate', () => {
        (0, vitest_1.expect)((0, historicalTollEstimate_1.estimateHistoricalToll)({ source, destination, distanceKm: 100, vehicleClass: 'BUS_TRUCK', observations: [] })).toBeUndefined();
    });
    (0, vitest_1.it)('bootstraps another vehicle class from positive recorded fleet tolls at low confidence', () => {
        const result = (0, historicalTollEstimate_1.estimateHistoricalToll)({ source, destination, distanceKm: 265, vehicleClass: 'CAR_VAN', observations: [{ source: 'Ahmedabad', destination: 'Surat', distanceKm: 265, tollAmountInr: 3200, vehicleClass: 'BUS_TRUCK', observedAt: '2026-08-31' }] });
        (0, vitest_1.expect)(result).toMatchObject({ estimatedTollInr: 928, source: 'HISTORICAL_FLEET_NORMALIZED', confidence: 'LOW', sampleSize: 1 });
    });
    (0, vitest_1.it)('derives a conservative toll class from stored vehicle data', () => {
        (0, vitest_1.expect)((0, historicalTollEstimate_1.resolveTollVehicleClass)('Delivery Van', 900)).toBe('CAR_VAN');
        (0, vitest_1.expect)((0, historicalTollEstimate_1.resolveTollVehicleClass)('Mini Truck', 4500)).toBe('LCV');
        (0, vitest_1.expect)((0, historicalTollEstimate_1.resolveTollVehicleClass)('Heavy Truck', 12000)).toBe('BUS_TRUCK');
    });
    (0, vitest_1.it)('matches finance toll expenses to the completed vehicle trip window', () => {
        const completedAt = new Date('2026-08-02T12:00:00Z');
        const rows = (0, historicalTollEstimate_1.buildHistoricalTollObservations)([{ id: 't1', vehicleId: 'v1', vehicleType: 'Mini Truck', vehicleCapacityKg: 4500, source: 'Ahmedabad', destination: 'Surat', distanceKm: 250, createdAt: new Date('2026-08-01'), dispatchedAt: new Date('2026-08-02'), completedAt, providerEstimatedTollInr: null }], [{ vehicleId: 'v1', amountInr: 1200, date: new Date('2026-08-02T10:00:00Z') }]);
        (0, vitest_1.expect)(rows).toMatchObject([{ tollAmountInr: 1200, vehicleClass: 'LCV' }]);
    });
});
