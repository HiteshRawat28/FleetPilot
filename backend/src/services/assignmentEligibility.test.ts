import { describe, expect, it } from 'vitest';
import { DriverStatus, LicenseCategory, TripStatus, VehicleStatus } from '@prisma/client';
import { evaluateAssignment } from './assignmentEligibility';

const vehicle = {
  name: 'Van-05',
  capacityKg: 500,
  requiredLicenseCategory: LicenseCategory.LMV,
  status: VehicleStatus.AVAILABLE
};
const driver = {
  name: 'Alex',
  licenseCategory: LicenseCategory.LMV,
  licenseExpiry: new Date('2028-12-10T00:00:00.000Z'),
  status: DriverStatus.AVAILABLE
};
const now = new Date('2026-08-31T00:00:00.000Z');

describe('evaluateAssignment', () => {
  it('accepts an eligible assignment at exact vehicle capacity', () => {
    expect(evaluateAssignment({ vehicle, driver, cargoWeightKg: 500, now })).toEqual([]);
  });

  it('reports the exact capacity overage', () => {
    expect(evaluateAssignment({ vehicle, driver, cargoWeightKg: 620, now })).toContainEqual({
      code: 'CARGO_OVER_CAPACITY',
      field: 'cargoWeightKg',
      message: "Cargo exceeds Van-05's capacity by 120 kg.",
      details: { cargoWeightKg: 620, capacityKg: 500, excessKg: 120 }
    });
  });

  it('reports licence expiry and category mismatch together', () => {
    const reasons = evaluateAssignment({
      vehicle,
      driver: { ...driver, licenseCategory: LicenseCategory.MCWG, licenseExpiry: new Date('2025-01-20T00:00:00.000Z') },
      cargoWeightKg: 400,
      now
    });
    expect(reasons.map(reason => reason.code)).toEqual(['LICENSE_EXPIRED', 'LICENSE_CATEGORY_MISMATCH']);
    expect(reasons[0].message).toContain('2025-01-20');
  });

  it('returns every simultaneous operational conflict', () => {
    const reasons = evaluateAssignment({
      vehicle: { ...vehicle, status: VehicleStatus.IN_SHOP },
      driver: { ...driver, status: DriverStatus.SUSPENDED, licenseExpiry: new Date('2025-01-20T00:00:00.000Z') },
      cargoWeightKg: 620,
      maintenanceService: 'Oil Change',
      now
    });
    expect(reasons.map(reason => reason.code)).toEqual([
      'VEHICLE_IN_MAINTENANCE',
      'CARGO_OVER_CAPACITY',
      'DRIVER_SUSPENDED',
      'LICENSE_EXPIRED'
    ]);
  });

  it('identifies non-draft dispatch attempts and missing resources', () => {
    expect(evaluateAssignment({
      vehicle: null,
      driver: null,
      cargoWeightKg: 100,
      tripStatus: TripStatus.CANCELLED,
      now
    }).map(reason => reason.code)).toEqual(['TRIP_NOT_DRAFT', 'VEHICLE_NOT_FOUND', 'DRIVER_NOT_FOUND']);
  });
});
