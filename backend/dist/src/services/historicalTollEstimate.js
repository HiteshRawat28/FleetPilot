"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTollVehicleClass = resolveTollVehicleClass;
exports.estimateHistoricalToll = estimateHistoricalToll;
exports.buildHistoricalTollObservations = buildHistoricalTollObservations;
function resolveTollVehicleClass(vehicleType, capacityKg) {
    const type = vehicleType.trim().toLowerCase();
    if (/\b(van|car|jeep)\b/.test(type))
        return 'CAR_VAN';
    if (/\b(lcv|light|mini)\b/.test(type) || (/\btruck\b/.test(type) && capacityKg <= 7500))
        return 'LCV';
    if (/\b(bus|coach|truck|hcv|heavy commercial)\b/.test(type))
        return capacityKg > 16000 ? 'MULTI_AXLE' : 'BUS_TRUCK';
    return capacityKg <= 3500 ? 'CAR_VAN' : capacityKg <= 7500 ? 'LCV' : capacityKg <= 16000 ? 'BUS_TRUCK' : 'MULTI_AXLE';
}
const normalized = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function placeTokens(place) { const specific = [place.name, place.city].filter((value) => Boolean(value && value.trim().length >= 3)).map(normalized); return [...new Set(specific.length ? specific : [normalized(place.state)])]; }
function containsPlace(value, place) { const text = normalized(value); return placeTokens(place).some(token => text.includes(token)); }
function sameCorridor(row, source, destination) {
    return (containsPlace(row.source, source) && containsPlace(row.destination, destination)) || (containsPlace(row.source, destination) && containsPlace(row.destination, source));
}
function estimateHistoricalToll(input) {
    if (!Number.isFinite(input.distanceKm) || input.distanceKm <= 0)
        throw new RangeError('distanceKm must be positive');
    const valid = input.observations.filter(row => Number.isFinite(row.distanceKm) && row.distanceKm > 0 && Number.isFinite(row.tollAmountInr) && row.tollAmountInr > 0 && !Number.isNaN(new Date(row.observedAt).getTime()));
    if (!valid.length)
        return undefined;
    const sameClass = valid.filter(row => row.vehicleClass === input.vehicleClass);
    const corridor = sameClass.filter(row => sameCorridor(row, input.source, input.destination));
    const selected = corridor.length ? corridor : sameClass;
    const classFactors = { CAR_VAN: 1, LCV: 1.65, BUS_TRUCK: 3.45, MULTI_AXLE: 5.4 };
    const normalized = !selected.length;
    const observations = normalized ? valid : selected;
    const ratePerKmInr = normalized
        ? observations.reduce((sum, row) => sum + row.tollAmountInr / classFactors[row.vehicleClass], 0) / observations.reduce((sum, row) => sum + row.distanceKm, 0) * classFactors[input.vehicleClass]
        : observations.reduce((sum, row) => sum + row.tollAmountInr, 0) / observations.reduce((sum, row) => sum + row.distanceKm, 0);
    const source = normalized ? 'HISTORICAL_FLEET_NORMALIZED' : corridor.length ? 'HISTORICAL_CORRIDOR' : 'HISTORICAL_VEHICLE_CLASS';
    const confidence = source === 'HISTORICAL_CORRIDOR' ? (observations.length >= 3 ? 'HIGH' : observations.length >= 2 ? 'MEDIUM' : 'LOW') : 'LOW';
    const asOf = new Date(Math.max(...observations.map(row => new Date(row.observedAt).getTime()))).toISOString();
    return { estimatedTollInr: Math.round(input.distanceKm * ratePerKmInr), ratePerKmInr: Math.round(ratePerKmInr * 100) / 100, source, confidence, sampleSize: observations.length, asOf };
}
function buildHistoricalTollObservations(trips, expenses) {
    return trips.flatMap(trip => {
        const start = (trip.dispatchedAt || trip.createdAt).getTime() - 12 * 60 * 60 * 1000;
        const end = (trip.completedAt || trip.dispatchedAt || trip.createdAt).getTime() + 36 * 60 * 60 * 1000;
        const matching = expenses.filter(expense => expense.vehicleId === trip.vehicleId && expense.date.getTime() >= start && expense.date.getTime() <= end && expense.amountInr > 0);
        const recordedAmount = matching.reduce((sum, expense) => sum + expense.amountInr, 0);
        const tollAmountInr = recordedAmount > 0 ? recordedAmount : trip.providerEstimatedTollInr;
        if (tollAmountInr === null || tollAmountInr <= 0 || trip.distanceKm <= 0)
            return [];
        const observedAt = matching.length ? new Date(Math.max(...matching.map(expense => expense.date.getTime()))) : trip.completedAt || trip.dispatchedAt || trip.createdAt;
        return [{ source: trip.source, destination: trip.destination, distanceKm: trip.distanceKm, tollAmountInr, vehicleClass: resolveTollVehicleClass(trip.vehicleType, trip.vehicleCapacityKg), observedAt }];
    });
}
