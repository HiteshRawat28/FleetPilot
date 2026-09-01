"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const client_1 = require("@prisma/client");
const assignmentEligibility_1 = require("./assignmentEligibility");
const vehicle = {
    name: 'Van-05',
    capacityKg: 500,
    requiredLicenseCategory: client_1.LicenseCategory.LMV,
    status: client_1.VehicleStatus.AVAILABLE
};
const driver = {
    name: 'Alex',
    licenseCategory: client_1.LicenseCategory.LMV,
    licenseExpiry: new Date('2028-12-10T00:00:00.000Z'),
    status: client_1.DriverStatus.AVAILABLE
};
const now = new Date('2026-08-31T00:00:00.000Z');
(0, vitest_1.describe)('evaluateAssignment', () => {
    (0, vitest_1.it)('accepts an eligible assignment at exact vehicle capacity', () => {
        (0, vitest_1.expect)((0, assignmentEligibility_1.evaluateAssignment)({ vehicle, driver, cargoWeightKg: 500, now })).toEqual([]);
    });
    (0, vitest_1.it)('reports the exact capacity overage', () => {
        (0, vitest_1.expect)((0, assignmentEligibility_1.evaluateAssignment)({ vehicle, driver, cargoWeightKg: 620, now })).toContainEqual({
            code: 'CARGO_OVER_CAPACITY',
            field: 'cargoWeightKg',
            message: "Cargo exceeds Van-05's capacity by 120 kg.",
            details: { cargoWeightKg: 620, capacityKg: 500, excessKg: 120 }
        });
    });
    (0, vitest_1.it)('reports licence expiry and category mismatch together', () => {
        const reasons = (0, assignmentEligibility_1.evaluateAssignment)({
            vehicle,
            driver: { ...driver, licenseCategory: client_1.LicenseCategory.MCWG, licenseExpiry: new Date('2025-01-20T00:00:00.000Z') },
            cargoWeightKg: 400,
            now
        });
        (0, vitest_1.expect)(reasons.map(reason => reason.code)).toEqual(['LICENSE_EXPIRED', 'LICENSE_CATEGORY_MISMATCH']);
        (0, vitest_1.expect)(reasons[0].message).toContain('2025-01-20');
    });
    (0, vitest_1.it)('returns every simultaneous operational conflict', () => {
        const reasons = (0, assignmentEligibility_1.evaluateAssignment)({
            vehicle: { ...vehicle, status: client_1.VehicleStatus.IN_SHOP },
            driver: { ...driver, status: client_1.DriverStatus.SUSPENDED, licenseExpiry: new Date('2025-01-20T00:00:00.000Z') },
            cargoWeightKg: 620,
            maintenanceService: 'Oil Change',
            now
        });
        (0, vitest_1.expect)(reasons.map(reason => reason.code)).toEqual([
            'VEHICLE_IN_MAINTENANCE',
            'CARGO_OVER_CAPACITY',
            'DRIVER_SUSPENDED',
            'LICENSE_EXPIRED'
        ]);
    });
    (0, vitest_1.it)('identifies non-draft dispatch attempts and missing resources', () => {
        (0, vitest_1.expect)((0, assignmentEligibility_1.evaluateAssignment)({
            vehicle: null,
            driver: null,
            cargoWeightKg: 100,
            tripStatus: client_1.TripStatus.CANCELLED,
            now
        }).map(reason => reason.code)).toEqual(['TRIP_NOT_DRAFT', 'VEHICLE_NOT_FOUND', 'DRIVER_NOT_FOUND']);
    });
});
