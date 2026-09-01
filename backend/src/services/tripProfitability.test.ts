import { describe, expect, it } from 'vitest';
import { buildFuelPrediction, calculateRealizedTripProfitability, calculateTripProfitability, resolveFuelRate, type TripProfitabilityConfig } from './tripProfitability';

const config: TripProfitabilityConfig = {
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

describe('calculateTripProfitability', () => {
  it('resolves vehicle-specific and fallback fuel rates', () => {
    expect(resolveFuelRate('Delivery Van', config)).toEqual({ source: 'VAN', ratePerKmInr: 14 });
    expect(resolveFuelRate('City Bus', config)).toEqual({ source: 'BUS', ratePerKmInr: 21 });
    expect(resolveFuelRate('Heavy Truck', config)).toEqual({ source: 'TRUCK', ratePerKmInr: 24 });
    expect(resolveFuelRate('Utility Vehicle', config)).toEqual({ source: 'DEFAULT', ratePerKmInr: 18 });
  });

  it('uses sufficient recorded maintenance history and calculates the full breakdown', () => {
    expect(calculateTripProfitability(base)).toEqual({
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

  it('uses recent recorded fuel price and vehicle efficiency before the fixed fallback rate',()=>{
    const estimate=calculateTripProfitability({...base,fuelPrediction:{pricePerLitreInr:92,efficiencyKmPerLitre:4.2,priceAsOf:'2026-09-01T00:00:00.000Z'}});
    expect(estimate.fuelRateSource).toBe('RECENT_FUEL_AND_TRIP_HISTORY');
    expect(estimate.fuelRatePerKmInr).toBe(21.9048);
    expect(estimate.estimatedFuelCostInr).toBe(8761.9);
    expect(estimate.fuelPricePerLitreInr).toBe(92);
    expect(estimate.fuelEfficiencyKmPerLitre).toBe(4.2);
    expect(estimate.fuelPriceAsOf).toBe('2026-09-01T00:00:00.000Z');
  });

  it('falls back to the depreciation heuristic when distance history is insufficient', () => {
    const estimate = calculateTripProfitability({ ...base, historicalCompletedDistanceKm: 999 });
    expect(estimate.maintenanceRateSource).toBe('DEPRECIATION_HEURISTIC');
    expect(estimate.maintenanceRatePerKmInr).toBe(4);
    expect(estimate.estimatedMaintenanceCostInr).toBe(1600);
  });

  it('reports a loss and avoids division by zero for zero revenue', () => {
    const estimate = calculateTripProfitability({ ...base, revenueInr: 0, estimatedTollsInr: 0 });
    expect(estimate.estimatedProfitInr).toBe(-11600);
    expect(estimate.profitMarginPercent).toBeNull();
  });

  it('returns a partial estimate instead of treating unavailable tolls as zero', () => {
    const estimate = calculateTripProfitability({ ...base, estimatedTollsInr: null });
    expect(estimate.estimatedTollsInr).toBeNull();
    expect(estimate.estimatedTotalCostInr).toBeNull();
    expect(estimate.estimatedProfitInr).toBeNull();
    expect(estimate.profitMarginPercent).toBeNull();
    expect(estimate.estimateStatus).toBe('PARTIAL_TOLLS_UNAVAILABLE');
  });

  it('rounds currency deterministically without mutating the input', () => {
    const input = { ...base, plannedDistanceKm: 10.555, historicalMaintenanceCostInr: 1000, historicalCompletedDistanceKm: 3000 };
    const snapshot = structuredClone(input);
    const estimate = calculateTripProfitability(input);
    expect(estimate.estimatedFuelCostInr).toBe(253.32);
    expect(estimate.estimatedMaintenanceCostInr).toBe(3.52);
    expect(input).toEqual(snapshot);
  });

  it('rejects invalid numeric inputs instead of silently correcting them', () => {
    expect(() => calculateTripProfitability({ ...base, plannedDistanceKm: 0 })).toThrow('plannedDistanceKm');
    expect(() => calculateTripProfitability({ ...base, estimatedTollsInr: -1 })).toThrow('estimatedTollsInr');
    expect(() => calculateTripProfitability({ ...base, revenueInr: Number.NaN })).toThrow('revenueInr');
  });
});

describe('buildFuelPrediction',()=>{
  it('weights recent recorded prices by litres and vehicle efficiency by fuel consumed',()=>{
    expect(buildFuelPrediction(
      [{liters:40,cost:3600,date:'2026-08-31T00:00:00.000Z'},{liters:60,cost:5580,date:'2026-09-01T00:00:00.000Z'}],
      [{distanceKm:420,fuelConsumedL:100},{distanceKm:210,fuelConsumedL:50}]
    )).toEqual({pricePerLitreInr:91.8,efficiencyKmPerLitre:4.2,priceAsOf:'2026-09-01T00:00:00.000Z'});
  });

  it('returns no prediction until both price and efficiency history exist',()=>{
    expect(buildFuelPrediction([], [{distanceKm:100,fuelConsumedL:20}])).toBeUndefined();
    expect(buildFuelPrediction([{liters:20,cost:1800,date:'2026-09-01'}], [])).toBeUndefined();
  });
});

describe('calculateRealizedTripProfitability',()=>{
  it('keeps driver, toll and other expenses separate while calculating realized profit',()=>{
    expect(calculateRealizedTripProfitability({revenueInr:50000,fuelCostInr:9000,maintenanceCostInr:1200,otherExpenseCostInr:800,driverPayoutInr:2500,tollCostInr:1800})).toEqual({revenueInr:50000,fuelCostInr:9000,maintenanceCostInr:1200,otherExpenseCostInr:800,driverPayoutInr:2500,tollCostInr:1800,actualTotalCostInr:15300,actualProfitInr:34700,actualProfitMarginPercent:69.4});
  });

  it('does not create a misleading margin when revenue is zero',()=>{
    expect(calculateRealizedTripProfitability({revenueInr:0,fuelCostInr:100,maintenanceCostInr:0,otherExpenseCostInr:0,driverPayoutInr:0,tollCostInr:0}).actualProfitMarginPercent).toBeNull();
  });
});
