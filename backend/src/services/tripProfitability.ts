export type FallbackFuelRateSource = 'VAN' | 'TRUCK' | 'BUS' | 'DEFAULT';
export type FuelRateSource = 'RECENT_FUEL_AND_TRIP_HISTORY' | FallbackFuelRateSource;
export type MaintenanceRateSource = 'HISTORICAL_MAINTENANCE' | 'DEPRECIATION_HEURISTIC';

export type TripProfitabilityConfig = {
  fuelRatesInrPerKm: Record<FallbackFuelRateSource, number>;
  maintenanceMinHistoryKm: number;
  vehicleUsefulLifeKm: number;
};

export type TripProfitabilityInput = {
  revenueInr: number;
  plannedDistanceKm: number;
  estimatedTollsInr: number | null;
  vehicleType: string;
  vehicleAcquisitionCostInr: number;
  historicalMaintenanceCostInr: number;
  historicalCompletedDistanceKm: number;
  fuelPrediction?: {
    pricePerLitreInr: number;
    efficiencyKmPerLitre: number;
    priceAsOf: string;
  };
  config: TripProfitabilityConfig;
};

export type TripProfitabilityEstimate = {
  expectedRevenueInr: number;
  estimatedFuelCostInr: number;
  estimatedMaintenanceCostInr: number;
  estimatedTollsInr: number | null;
  estimatedTotalCostInr: number | null;
  estimatedProfitInr: number | null;
  profitMarginPercent: number | null;
  fuelRatePerKmInr: number;
  fuelPricePerLitreInr: number | null;
  fuelEfficiencyKmPerLitre: number | null;
  fuelPriceAsOf: string | null;
  maintenanceRatePerKmInr: number;
  fuelRateSource: FuelRateSource;
  maintenanceRateSource: MaintenanceRateSource;
  estimateStatus: 'COMPLETE' | 'PARTIAL_TOLLS_UNAVAILABLE';
};

export type FuelPriceObservation={liters:number;cost:number;date:Date|string};
export type FuelEfficiencyObservation={distanceKm:number;fuelConsumedL:number};

const DEFAULT_CONFIG: TripProfitabilityConfig = {
  fuelRatesInrPerKm: { DEFAULT: 18, VAN: 14, TRUCK: 24, BUS: 21 },
  maintenanceMinHistoryKm: 1000,
  vehicleUsefulLifeKm: 300000
};

function configuredNumber(value: string | undefined, fallback: number, name: string) {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number`);
  return parsed;
}

export function loadTripProfitabilityConfig(env: NodeJS.ProcessEnv = process.env): TripProfitabilityConfig {
  return {
    fuelRatesInrPerKm: {
      DEFAULT: configuredNumber(env.TRIP_FUEL_RATE_DEFAULT_INR_PER_KM, DEFAULT_CONFIG.fuelRatesInrPerKm.DEFAULT, 'TRIP_FUEL_RATE_DEFAULT_INR_PER_KM'),
      VAN: configuredNumber(env.TRIP_FUEL_RATE_VAN_INR_PER_KM, DEFAULT_CONFIG.fuelRatesInrPerKm.VAN, 'TRIP_FUEL_RATE_VAN_INR_PER_KM'),
      TRUCK: configuredNumber(env.TRIP_FUEL_RATE_TRUCK_INR_PER_KM, DEFAULT_CONFIG.fuelRatesInrPerKm.TRUCK, 'TRIP_FUEL_RATE_TRUCK_INR_PER_KM'),
      BUS: configuredNumber(env.TRIP_FUEL_RATE_BUS_INR_PER_KM, DEFAULT_CONFIG.fuelRatesInrPerKm.BUS, 'TRIP_FUEL_RATE_BUS_INR_PER_KM')
    },
    maintenanceMinHistoryKm: configuredNumber(env.TRIP_MAINTENANCE_MIN_HISTORY_KM, DEFAULT_CONFIG.maintenanceMinHistoryKm, 'TRIP_MAINTENANCE_MIN_HISTORY_KM'),
    vehicleUsefulLifeKm: configuredNumber(env.TRIP_VEHICLE_USEFUL_LIFE_KM, DEFAULT_CONFIG.vehicleUsefulLifeKm, 'TRIP_VEHICLE_USEFUL_LIFE_KM')
  };
}

function assertFiniteNonNegative(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a finite non-negative number`);
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundRate(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export function resolveFuelRate(vehicleType: string, config: TripProfitabilityConfig) {
  const normalized = vehicleType.trim().toLowerCase();
  const source: FallbackFuelRateSource = /\b(bus|coach)\b/.test(normalized)
    ? 'BUS'
    : /\b(truck|hcv|heavy commercial)\b/.test(normalized)
      ? 'TRUCK'
      : /\b(van|lcv|light commercial)\b/.test(normalized)
        ? 'VAN'
        : 'DEFAULT';
  return { source, ratePerKmInr: config.fuelRatesInrPerKm[source] };
}

export function resolvePredictedFuelRate(input: TripProfitabilityInput) {
  const prediction=input.fuelPrediction;
  if(prediction){
    if(!Number.isFinite(prediction.pricePerLitreInr)||prediction.pricePerLitreInr<=0)throw new RangeError('fuel price must be a finite positive number');
    if(!Number.isFinite(prediction.efficiencyKmPerLitre)||prediction.efficiencyKmPerLitre<=0)throw new RangeError('fuel efficiency must be a finite positive number');
    if(!prediction.priceAsOf||Number.isNaN(Date.parse(prediction.priceAsOf)))throw new RangeError('fuel price date must be valid');
    return {
      source:'RECENT_FUEL_AND_TRIP_HISTORY' as const,
      ratePerKmInr:prediction.pricePerLitreInr/prediction.efficiencyKmPerLitre,
      pricePerLitreInr:prediction.pricePerLitreInr,
      efficiencyKmPerLitre:prediction.efficiencyKmPerLitre,
      priceAsOf:prediction.priceAsOf
    };
  }
  const fallback=resolveFuelRate(input.vehicleType,input.config);
  return {...fallback,pricePerLitreInr:null,efficiencyKmPerLitre:null,priceAsOf:null};
}

export function buildFuelPrediction(fuelLogs:FuelPriceObservation[],completedTrips:FuelEfficiencyObservation[]){
  const validLogs=fuelLogs.filter(log=>Number.isFinite(log.liters)&&log.liters>0&&Number.isFinite(log.cost)&&log.cost>0&&!Number.isNaN(new Date(log.date).getTime()));
  const validTrips=completedTrips.filter(trip=>Number.isFinite(trip.distanceKm)&&trip.distanceKm>0&&Number.isFinite(trip.fuelConsumedL)&&trip.fuelConsumedL>0);
  if(!validLogs.length||!validTrips.length)return undefined;
  const totalLitresPurchased=validLogs.reduce((sum,log)=>sum+log.liters,0);
  const totalFuelCost=validLogs.reduce((sum,log)=>sum+log.cost,0);
  const totalDistance=validTrips.reduce((sum,trip)=>sum+trip.distanceKm,0);
  const totalFuelConsumed=validTrips.reduce((sum,trip)=>sum+trip.fuelConsumedL,0);
  const latestPriceDate=validLogs.reduce((latest,log)=>Math.max(latest,new Date(log.date).getTime()),0);
  return {
    pricePerLitreInr:totalFuelCost/totalLitresPurchased,
    efficiencyKmPerLitre:totalDistance/totalFuelConsumed,
    priceAsOf:new Date(latestPriceDate).toISOString()
  };
}

export function calculateTripProfitability(input: TripProfitabilityInput): TripProfitabilityEstimate {
  assertFiniteNonNegative(input.revenueInr, 'revenueInr');
  if(input.estimatedTollsInr!==null)assertFiniteNonNegative(input.estimatedTollsInr, 'estimatedTollsInr');
  assertFiniteNonNegative(input.vehicleAcquisitionCostInr, 'vehicleAcquisitionCostInr');
  assertFiniteNonNegative(input.historicalMaintenanceCostInr, 'historicalMaintenanceCostInr');
  assertFiniteNonNegative(input.historicalCompletedDistanceKm, 'historicalCompletedDistanceKm');
  if (!Number.isFinite(input.plannedDistanceKm) || input.plannedDistanceKm <= 0) throw new RangeError('plannedDistanceKm must be a finite positive number');

  Object.entries(input.config.fuelRatesInrPerKm).forEach(([name, value]) => {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`fuel rate ${name} must be a finite positive number`);
  });
  if (!Number.isFinite(input.config.maintenanceMinHistoryKm) || input.config.maintenanceMinHistoryKm <= 0) throw new RangeError('maintenanceMinHistoryKm must be a finite positive number');
  if (!Number.isFinite(input.config.vehicleUsefulLifeKm) || input.config.vehicleUsefulLifeKm <= 0) throw new RangeError('vehicleUsefulLifeKm must be a finite positive number');

  const fuel = resolvePredictedFuelRate(input);
  const useHistory = input.historicalMaintenanceCostInr > 0 && input.historicalCompletedDistanceKm >= input.config.maintenanceMinHistoryKm;
  const maintenanceRatePerKmInr = useHistory
    ? input.historicalMaintenanceCostInr / input.historicalCompletedDistanceKm
    : input.vehicleAcquisitionCostInr / input.config.vehicleUsefulLifeKm;
  const maintenanceRateSource: MaintenanceRateSource = useHistory ? 'HISTORICAL_MAINTENANCE' : 'DEPRECIATION_HEURISTIC';

  const expectedRevenueInr = roundCurrency(input.revenueInr);
  const estimatedFuelCostInr = roundCurrency(input.plannedDistanceKm * fuel.ratePerKmInr);
  const estimatedMaintenanceCostInr = roundCurrency(input.plannedDistanceKm * maintenanceRatePerKmInr);
  const estimatedTollsInr = input.estimatedTollsInr===null?null:roundCurrency(input.estimatedTollsInr);
  const estimatedTotalCostInr = estimatedTollsInr===null?null:roundCurrency(estimatedFuelCostInr + estimatedMaintenanceCostInr + estimatedTollsInr);
  const estimatedProfitInr = estimatedTotalCostInr===null?null:roundCurrency(expectedRevenueInr - estimatedTotalCostInr);

  return {
    expectedRevenueInr,
    estimatedFuelCostInr,
    estimatedMaintenanceCostInr,
    estimatedTollsInr,
    estimatedTotalCostInr,
    estimatedProfitInr,
    profitMarginPercent: expectedRevenueInr > 0&&estimatedProfitInr!==null ? Math.round((estimatedProfitInr / expectedRevenueInr) * 10000) / 100 : null,
    fuelRatePerKmInr: roundRate(fuel.ratePerKmInr),
    fuelPricePerLitreInr:fuel.pricePerLitreInr===null?null:roundCurrency(fuel.pricePerLitreInr),
    fuelEfficiencyKmPerLitre:fuel.efficiencyKmPerLitre===null?null:roundRate(fuel.efficiencyKmPerLitre),
    fuelPriceAsOf:fuel.priceAsOf,
    maintenanceRatePerKmInr: roundRate(maintenanceRatePerKmInr),
    fuelRateSource: fuel.source,
    maintenanceRateSource,
    estimateStatus:estimatedTollsInr===null?'PARTIAL_TOLLS_UNAVAILABLE':'COMPLETE'
  };
}
