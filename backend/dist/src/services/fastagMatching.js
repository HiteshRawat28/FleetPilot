"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectFastagTrip = selectFastagTrip;
function selectFastagTrip(candidates, occurredAt) {
    const lateSettlementWindowMs = 6 * 60 * 60 * 1000;
    const eligible = candidates.filter(trip => trip.dispatchedAt && trip.dispatchedAt <= occurredAt && trip.status !== 'DRAFT' && trip.status !== 'CANCELLED' && (!trip.completedAt || occurredAt.getTime() <= trip.completedAt.getTime() + lateSettlementWindowMs)).sort((a, b) => (b.dispatchedAt?.getTime() || 0) - (a.dispatchedAt?.getTime() || 0));
    const trip = eligible[0];
    if (!trip)
        return null;
    const confidence = trip.status === 'IN_PROGRESS' ? 0.99 : trip.status === 'DISPATCHED' ? 0.96 : 0.92;
    return { tripId: trip.id, confidence };
}
