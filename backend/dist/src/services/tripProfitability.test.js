"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const tripProfitability_1 = require("./tripProfitability");
const config = {
    fuelRatesInrPerKm: { DEFAULT: 18, VAN: 14, TRUCK: 24, BUS: 21 },
    maintenanceMinHistoryKm: 1000,
    vehicleUsefulLifeKm: 300000
};
const base = {
    revenueInr: 50000,
    plannedDistanceKm: 400,
    estimatedTollsInr: 2500,
    vehicleType: 'Heavy Truck',
    vehicleAcquisitionCostInr: 1200000,
    historicalMaintenanceCostInr: 30000,
    historicalCompletedDistanceKm: 6000,
    config
};
(0, vitest_1.describe)('calculateTripProfitability', () => {
    (0, vitest_1.it)('resolves vehicle-specific and fallback fuel rates', () => {
        (0, vitest_1.expect)((0, tripProfitability_1.resolveFuelRate)('Delivery Van', config)).toEqual({ source: 'VAN', ratePerKmInr: 14 });
        (0, vitest_1.expect)((0, tripProfitability_1.resolveFuelRate)('City Bus', config)).toEqual({ source: 'BUS', ratePerKmInr: 21 });
        (0, vitest_1.expect)((0, tripProfitability_1.resolveFuelRate)('Heavy Truck', config)).toEqual({ source: 'TRUCK', ratePerKmInr: 24 });
        (0, vitest_1.expect)((0, tripProfitability_1.resolveFuelRate)('Utility Vehicle', config)).toEqual({ source: 'DEFAULT', ratePerKmInr: 18 });
    });
    (0, vitest_1.it)('uses sufficient recorded maintenance history and calculates the full breakdown', () => {
        (0, vitest_1.expect)((0, tripProfitability_1.calculateTripProfitability)(base)).toEqual({
            expectedRevenueInr: 50000,
            estimatedFuelCostInr: 9600,
            estimatedMaintenanceCostInr: 2000,
            estimatedTollsInr: 2500,
            estimatedTotalCostInr: 14100,
            estimatedProfitInr: 35900,
            profitMarginPercent: 71.8,
            fuelRatePerKmInr: 24,
            fuelPricePerLitreInr: null,
            fuelEfficiencyKmPerLitre: null,
            fuelPriceAsOf: null,
            maintenanceRatePerKmInr: 5,
            fuelRateSource: 'TRUCK',
            maintenanceRateSource: 'HISTORICAL_MAINTENANCE',
            estimateStatus: 'COMPLETE'
        });
    });
    (0, vitest_1.it)('uses recent recorded fuel price and vehicle efficiency before the fixed fallback rate', () => {
        const estimate = (0, tripProfitability_1.calculateTripProfitability)({ ...base, fuelPrediction: { pricePerLitreInr: 92, efficiencyKmPerLitre: 4.2, priceAsOf: '2026-09-01T00:00:00.000Z' } });
        (0, vitest_1.expect)(estimate.fuelRateSource).toBe('RECENT_FUEL_AND_TRIP_HISTORY');
        (0, vitest_1.expect)(estimate.fuelRatePerKmInr).toBe(21.9048);
        (0, vitest_1.expect)(estimate.estimatedFuelCostInr).toBe(8761.9);
        (0, vitest_1.expect)(estimate.fuelPricePerLitreInr).toBe(92);
        (0, vitest_1.expect)(estimate.fuelEfficiencyKmPerLitre).toBe(4.2);
        (0, vitest_1.expect)(estimate.fuelPriceAsOf).toBe('2026-09-01T00:00:00.000Z');
    });
    (0, vitest_1.it)('falls back to the depreciation heuristic when distance history is insufficient', () => {
        const estimate = (0, tripProfitability_1.calculateTripProfitability)({ ...base, historicalCompletedDistanceKm: 999 });
        (0, vitest_1.expect)(estimate.maintenanceRateSource).toBe('DEPRECIATION_HEURISTIC');
        (0, vitest_1.expect)(estimate.maintenanceRatePerKmInr).toBe(4);
        (0, vitest_1.expect)(estimate.estimatedMaintenanceCostInr).toBe(1600);
    });
    (0, vitest_1.it)('reports a loss and avoids division by zero for zero revenue', () => {
        const estimate = (0, tripProfitability_1.calculateTripProfitability)({ ...base, revenueInr: 0, estimatedTollsInr: 0 });
        (0, vitest_1.expect)(estimate.estimatedProfitInr).toBe(-11600);
        (0, vitest_1.expect)(estimate.profitMarginPercent).toBeNull();
    });
    (0, vitest_1.it)('returns a partial estimate instead of treating unavailable tolls as zero', () => {
        const estimate = (0, tripProfitability_1.calculateTripProfitability)({ ...base, estimatedTollsInr: null });
        (0, vitest_1.expect)(estimate.estimatedTollsInr).toBeNull();
        (0, vitest_1.expect)(estimate.estimatedTotalCostInr).toBeNull();
        (0, vitest_1.expect)(estimate.estimatedProfitInr).toBeNull();
        (0, vitest_1.expect)(estimate.profitMarginPercent).toBeNull();
        (0, vitest_1.expect)(estimate.estimateStatus).toBe('PARTIAL_TOLLS_UNAVAILABLE');
    });
    (0, vitest_1.it)('rounds currency deterministically without mutating the input', () => {
        const input = { ...base, plannedDistanceKm: 10.555, historicalMaintenanceCostInr: 1000, historicalCompletedDistanceKm: 3000 };
        const snapshot = structuredClone(input);
        const estimate = (0, tripProfitability_1.calculateTripProfitability)(input);
        (0, vitest_1.expect)(estimate.estimatedFuelCostInr).toBe(253.32);
        (0, vitest_1.expect)(estimate.estimatedMaintenanceCostInr).toBe(3.52);
        (0, vitest_1.expect)(input).toEqual(snapshot);
    });
    (0, vitest_1.it)('rejects invalid numeric inputs instead of silently correcting them', () => {
        (0, vitest_1.expect)(() => (0, tripProfitability_1.calculateTripProfitability)({ ...base, plannedDistanceKm: 0 })).toThrow('plannedDistanceKm');
        (0, vitest_1.expect)(() => (0, tripProfitability_1.calculateTripProfitability)({ ...base, estimatedTollsInr: -1 })).toThrow('estimatedTollsInr');
        (0, vitest_1.expect)(() => (0, tripProfitability_1.calculateTripProfitability)({ ...base, revenueInr: Number.NaN })).toThrow('revenueInr');
    });
});
(0, vitest_1.describe)('buildFuelPrediction', () => {
    (0, vitest_1.it)('weights recent recorded prices by litres and vehicle efficiency by fuel consumed', () => {
        (0, vitest_1.expect)((0, tripProfitability_1.buildFuelPrediction)([{ liters: 40, cost: 3600, date: '2026-08-31T00:00:00.000Z' }, { liters: 60, cost: 5580, date: '2026-09-01T00:00:00.000Z' }], [{ distanceKm: 420, fuelConsumedL: 100 }, { distanceKm: 210, fuelConsumedL: 50 }])).toEqual({ pricePerLitreInr: 91.8, efficiencyKmPerLitre: 4.2, priceAsOf: '2026-09-01T00:00:00.000Z' });
    });
    (0, vitest_1.it)('returns no prediction until both price and efficiency history exist', () => {
        (0, vitest_1.expect)((0, tripProfitability_1.buildFuelPrediction)([], [{ distanceKm: 100, fuelConsumedL: 20 }])).toBeUndefined();
        (0, vitest_1.expect)((0, tripProfitability_1.buildFuelPrediction)([{ liters: 20, cost: 1800, date: '2026-09-01' }], [])).toBeUndefined();
    });
});
