"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fastagMatching_1 = require("./fastagMatching");
(0, vitest_1.describe)('FASTag trip matching', () => {
    const occurredAt = new Date('2026-09-01T10:30:00.000Z');
    (0, vitest_1.it)('chooses the latest active trip and returns high confidence', () => {
        const match = (0, fastagMatching_1.selectFastagTrip)([
            { id: 'older', status: 'COMPLETED', dispatchedAt: new Date('2026-08-30T09:00:00Z'), completedAt: new Date('2026-08-30T18:00:00Z') },
            { id: 'active', status: 'IN_PROGRESS', dispatchedAt: new Date('2026-09-01T08:00:00Z'), completedAt: null }
        ], occurredAt);
        (0, vitest_1.expect)(match).toEqual({ tripId: 'active', confidence: 0.99 });
    });
    (0, vitest_1.it)('accepts delayed plaza settlement within six hours of completion', () => {
        const match = (0, fastagMatching_1.selectFastagTrip)([{ id: 'completed', status: 'COMPLETED', dispatchedAt: new Date('2026-09-01T06:00:00Z'), completedAt: new Date('2026-09-01T09:00:00Z') }], occurredAt);
        (0, vitest_1.expect)(match).toEqual({ tripId: 'completed', confidence: 0.92 });
    });
    (0, vitest_1.it)('does not attach stale or cancelled transactions', () => {
        const match = (0, fastagMatching_1.selectFastagTrip)([
            { id: 'stale', status: 'COMPLETED', dispatchedAt: new Date('2026-08-31T06:00:00Z'), completedAt: new Date('2026-08-31T08:00:00Z') },
            { id: 'cancelled', status: 'CANCELLED', dispatchedAt: new Date('2026-09-01T08:00:00Z'), completedAt: null }
        ], occurredAt);
        (0, vitest_1.expect)(match).toBeNull();
    });
});
