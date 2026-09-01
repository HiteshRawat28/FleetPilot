"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const client_1 = require("@prisma/client");
const chat_1 = require("./chat");
const security_1 = require("./security");
const driver = { name: 'Driver A', licenseNo: 'LIC-SENSITIVE-01', licenseCategory: 'LMV', licenseExpiry: new Date('2028-01-01'), status: 'AVAILABLE', safetyScore: 95 };
const trip = { tripNo: 'TRP001', source: 'A', destination: 'B', status: 'DRAFT', cargoWeightKg: 100, plannedDistanceKm: 20, revenue: 9000, createdAt: new Date('2026-01-01'), vehicle: { name: 'Van', registrationNo: 'REG001' }, driver: { name: 'Driver A' } };
(0, vitest_1.describe)('Copilot role disclosure policy', () => {
    (0, vitest_1.it)('restricts financial analytics to financial and elevated operational roles', () => {
        (0, vitest_1.expect)((0, security_1.disclosurePolicyForRole)(client_1.Role.SAFETY_OFFICER).financialAnalytics).toBe(false);
        (0, vitest_1.expect)((0, security_1.disclosurePolicyForRole)(client_1.Role.DISPATCHER).financialAnalytics).toBe(false);
        (0, vitest_1.expect)((0, security_1.disclosurePolicyForRole)(client_1.Role.FINANCIAL_ANALYST).financialAnalytics).toBe(true);
        (0, vitest_1.expect)((0, security_1.disclosurePolicyForRole)(client_1.Role.FLEET_MANAGER).financialAnalytics).toBe(true);
    });
    (0, vitest_1.it)('removes driver licence numbers from dispatcher payloads', () => {
        (0, vitest_1.expect)((0, security_1.driverForCopilot)(driver, client_1.Role.DISPATCHER)).not.toHaveProperty('licenseNo');
        (0, vitest_1.expect)((0, security_1.driverForCopilot)(driver, client_1.Role.SAFETY_OFFICER)).toHaveProperty('licenseNo', 'LIC-SENSITIVE-01');
    });
    (0, vitest_1.it)('removes trip revenue from dispatcher payloads', () => {
        (0, vitest_1.expect)((0, security_1.tripForCopilot)(trip, client_1.Role.DISPATCHER)).not.toHaveProperty('revenue');
        (0, vitest_1.expect)((0, security_1.tripForCopilot)(trip, client_1.Role.FLEET_MANAGER)).toHaveProperty('revenue', 9000);
    });
    (0, vitest_1.it)('hides recent trip identities from safety and finance roles', () => {
        (0, vitest_1.expect)((0, security_1.recentTripsForCopilot)([trip], client_1.Role.SAFETY_OFFICER)).toEqual([]);
        (0, vitest_1.expect)((0, security_1.recentTripsForCopilot)([trip], client_1.Role.FINANCIAL_ANALYST)).toEqual([]);
        (0, vitest_1.expect)((0, security_1.recentTripsForCopilot)([trip], client_1.Role.DISPATCHER)).toHaveLength(1);
    });
    (0, vitest_1.it)('never includes Prisma ids in projected vehicle records', () => {
        const databaseVehicle = { ...driver, name: 'Van', registrationNo: 'REG001', type: 'Van', capacityKg: 500, requiredLicenseCategory: 'LMV', region: 'North', odometerKm: 10, id: 'internal-id' };
        (0, vitest_1.expect)((0, security_1.vehicleForCopilot)(databaseVehicle)).not.toHaveProperty('id');
    });
});
(0, vitest_1.describe)('Copilot deterministic output sanitizer', () => {
    (0, vitest_1.it)('redacts known tenant and record identifiers', () => (0, vitest_1.expect)((0, security_1.sanitizeCopilotText)('Org org-secret and row cuid-secret-value', ['org-secret', 'cuid-secret-value'])).toBe('Org [restricted] and row [restricted]'));
    (0, vitest_1.it)('redacts JWTs and UUIDs', () => {
        const text = 'eyJheaderpart12345.eyJpayloadpart12345.signature123 and 123e4567-e89b-42d3-a456-426614174000 and cm7abcdefghijklmnopqrstuv';
        (0, vitest_1.expect)((0, security_1.sanitizeCopilotText)(text)).toBe('[restricted token] and [restricted id] and [restricted id]');
    });
});
(0, vitest_1.describe)('Copilot tenant and field enforcement at the tool boundary', () => {
    const user = { id: 'user-a', name: 'Dispatcher', role: client_1.Role.DISPATCHER, organizationId: 'tenant-a', organizationName: 'Tenant A' };
    (0, vitest_1.it)('always applies the authenticated organization to vehicle queries and drops database ids', async () => {
        let where;
        const fakeDb = { vehicle: { findMany: async (args) => { where = args.where; return [{ id: 'private-row-id', organizationId: 'tenant-b', name: 'Van A', registrationNo: 'REG-A', type: 'Van', status: 'AVAILABLE', capacityKg: 500, requiredLicenseCategory: 'LMV', region: 'North', odometerKm: 20 }]; } } };
        const result = await (0, chat_1.executeTool)(fakeDb, user, 'search_vehicles', { organizationId: 'tenant-b', query: null, status: null, limit: 5 });
        (0, vitest_1.expect)(where).toMatchObject({ organizationId: 'tenant-a', status: 'AVAILABLE' });
        (0, vitest_1.expect)(JSON.stringify(result.data)).not.toContain('private-row-id');
        (0, vitest_1.expect)(JSON.stringify(result.data)).not.toContain('tenant-b');
    });
    (0, vitest_1.it)('removes licence numbers from dispatcher driver tool results', async () => {
        const fakeDb = { driver: { findMany: async () => [{ id: 'driver-private-id', name: 'Driver A', licenseNo: 'LIC-PRIVATE', licenseCategory: 'LMV', licenseExpiry: new Date('2028-01-01'), status: 'AVAILABLE', safetyScore: 90 }] } };
        const result = await (0, chat_1.executeTool)(fakeDb, user, 'search_drivers', { query: null, status: null, expiringWithinDays: null, limit: 5 });
        (0, vitest_1.expect)(JSON.stringify(result.data)).not.toContain('LIC-PRIVATE');
        (0, vitest_1.expect)(JSON.stringify(result.data)).not.toContain('driver-private-id');
    });
    (0, vitest_1.it)('removes revenue from dispatcher trip tool results', async () => {
        const fakeDb = { trip: { findMany: async () => [{ id: 'trip-private-id', tripNo: 'TRP001', source: 'A', destination: 'B', status: 'DRAFT', cargoWeightKg: 100, plannedDistanceKm: 20, revenue: 999999, createdAt: new Date('2026-01-01'), vehicle: { name: 'Van', registrationNo: 'REG-A' }, driver: { name: 'Driver A' } }] } };
        const result = await (0, chat_1.executeTool)(fakeDb, user, 'search_trips', { query: null, status: null, limit: 5 });
        (0, vitest_1.expect)(JSON.stringify(result.data)).not.toContain('999999');
        (0, vitest_1.expect)(JSON.stringify(result.data)).not.toContain('trip-private-id');
    });
    (0, vitest_1.it)('does not reveal licence numbers while asking a dispatcher to disambiguate drivers', async () => {
        const fakeDb = {
            vehicle: { findMany: async () => [{ id: 'vehicle-a', name: 'Van A', registrationNo: 'REG-A' }] },
            driver: { findMany: async () => [
                    { id: 'driver-a', name: 'Alex', licenseNo: 'LIC-PRIVATE-A', licenseCategory: 'LMV' },
                    { id: 'driver-b', name: 'Alex', licenseNo: 'LIC-PRIVATE-B', licenseCategory: 'HMV' }
                ] }
        };
        const result = await (0, chat_1.executeTool)(fakeDb, user, 'check_assignment', { vehicleQuery: 'Van A', driverQuery: 'Alex', cargoWeightKg: 100 });
        (0, vitest_1.expect)(result.data).toMatchObject({ driverMatches: ['Alex (LMV)', 'Alex (HMV)'] });
        (0, vitest_1.expect)(JSON.stringify(result.data)).not.toContain('LIC-PRIVATE');
    });
});
