"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const client_1 = require("@prisma/client");
const actions_1 = require("./actions");
const payload = { v: 1, type: 'CREATE_DRAFT_TRIP', sub: 'user-1', org: 'org-1', role: client_1.Role.DISPATCHER, idempotencyKey: 'c6e17b33-0db1-41f1-a067-f4b918c20db4', data: { source: 'Delhi', destination: 'Jaipur', vehicleId: 'vehicle-1', driverId: 'driver-1', cargoWeightKg: 1200, plannedDistanceKm: 280, revenue: 18000 }, iat: 1_000, exp: 2_000 };
(0, vitest_1.describe)('Copilot action confirmation tokens', () => {
    (0, vitest_1.it)('round-trips a signed action payload', () => (0, vitest_1.expect)((0, actions_1.verifyActionToken)((0, actions_1.signActionPayload)(payload, 'secret'), 'secret', 1_500_000)).toEqual(payload));
    (0, vitest_1.it)('rejects a tampered token', () => (0, vitest_1.expect)(() => (0, actions_1.verifyActionToken)(`${(0, actions_1.signActionPayload)(payload, 'secret')}x`, 'secret', 1_500_000)).toThrow('invalid'));
    (0, vitest_1.it)('rejects a signed but malformed payload', () => (0, vitest_1.expect)(() => (0, actions_1.verifyActionToken)((0, actions_1.signActionPayload)({ ...payload, exp: undefined }, 'secret'), 'secret', 1_500_000)).toThrow('invalid'));
    (0, vitest_1.it)('rejects an expired token', () => (0, vitest_1.expect)(() => (0, actions_1.verifyActionToken)((0, actions_1.signActionPayload)(payload, 'secret'), 'secret', 2_001_000)).toThrow('expired'));
    (0, vitest_1.it)('rejects guided preparation before database access for every non-admin role', async () => {
        await (0, vitest_1.expect)((0, actions_1.prepareSelectedDraftTripAction)({}, { id: 'dispatcher-1', organizationId: 'org-1', role: client_1.Role.DISPATCHER }, { source: 'Delhi', destination: 'Jaipur', vehicleId: 'vehicle-1', driverId: 'driver-1', cargoWeightKg: 1200, plannedDistanceKm: 280, revenue: 18000 })).rejects.toMatchObject({ status: 403 });
    });
    (0, vitest_1.it)('prepares a confirmation card for an eligible organization administrator selection', async () => {
        const vehicle = { id: 'vehicle-1', name: 'Admin Truck', registrationNo: 'ADMIN-TRUCK-1', status: 'AVAILABLE', capacityKg: 3000, requiredLicenseCategory: 'HMV' };
        const driver = { id: 'driver-1', name: 'Admin Driver', status: 'AVAILABLE', licenseNo: 'ADMIN-LIC-1', licenseCategory: 'HMV', licenseExpiry: new Date(Date.now() + 86_400_000) };
        const organizations = [];
        const fakeDb = {
            vehicle: { findFirst: async ({ where }) => { organizations.push(where.organizationId); return vehicle; } },
            driver: { findFirst: async ({ where }) => { organizations.push(where.organizationId); return driver; } },
            trip: { findFirst: async () => null }, maintenance: { findFirst: async () => null }
        };
        const result = await (0, actions_1.prepareSelectedDraftTripAction)(fakeDb, { id: 'admin-1', organizationId: 'org-1', role: client_1.Role.ADMIN }, { source: 'Delhi', destination: 'Jaipur', vehicleId: 'vehicle-1', driverId: 'driver-1', cargoWeightKg: 1200, plannedDistanceKm: 280, revenue: 18000 });
        (0, vitest_1.expect)(organizations.every(value => value === 'org-1')).toBe(true);
        (0, vitest_1.expect)(result.action?.summary).toContain('Admin Truck and Admin Driver');
        (0, vitest_1.expect)(result.action?.confirmationToken).toBeTruthy();
    });
});
