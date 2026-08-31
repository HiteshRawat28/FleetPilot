import { DriverStatus, LicenseCategory, TripStatus, VehicleStatus } from '@prisma/client';

export type AssignmentFailureCode =
  | 'VEHICLE_NOT_FOUND'
  | 'DRIVER_NOT_FOUND'
  | 'VEHICLE_ON_TRIP'
  | 'VEHICLE_IN_MAINTENANCE'
  | 'VEHICLE_RETIRED'
  | 'DRIVER_ON_TRIP'
  | 'DRIVER_OFF_DUTY'
  | 'DRIVER_SUSPENDED'
  | 'LICENSE_EXPIRED'
  | 'LICENSE_CATEGORY_MISMATCH'
  | 'CARGO_OVER_CAPACITY'
  | 'TRIP_NOT_DRAFT';

export type AssignmentFailureReason = {
  code: AssignmentFailureCode;
  message: string;
  field: 'vehicleId' | 'driverId' | 'cargoWeightKg' | 'tripId';
  details?: Record<string, string | number>;
};

type AssignmentVehicle = {
  name: string;
  capacityKg: number;
  requiredLicenseCategory: LicenseCategory;
  status: VehicleStatus;
};

type AssignmentDriver = {
  name: string;
  licenseCategory: string;
  licenseExpiry: Date;
  status: DriverStatus;
};

export type AssignmentEligibilityInput = {
  vehicle: AssignmentVehicle | null;
  driver: AssignmentDriver | null;
  cargoWeightKg: number;
  now?: Date;
  tripStatus?: TripStatus;
  vehicleTripNo?: string;
  driverTripNo?: string;
  maintenanceService?: string;
};

const number = (value: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value);
const day = (value: Date) => value.toISOString().slice(0, 10);

export function evaluateAssignment(input: AssignmentEligibilityInput): AssignmentFailureReason[] {
  const reasons: AssignmentFailureReason[] = [];
  const now = input.now ?? new Date();
  const { vehicle, driver } = input;

  if (input.tripStatus && input.tripStatus !== TripStatus.DRAFT) {
    reasons.push({
      code: 'TRIP_NOT_DRAFT',
      field: 'tripId',
      message: `Only draft trips can be dispatched; this trip is ${input.tripStatus.toLowerCase().replace('_', ' ')}.`,
      details: { tripStatus: input.tripStatus }
    });
  }

  if (!vehicle) {
    reasons.push({ code: 'VEHICLE_NOT_FOUND', field: 'vehicleId', message: 'The selected vehicle no longer exists.' });
  } else {
    if (vehicle.status === VehicleStatus.ON_TRIP) {
      const trip = input.vehicleTripNo ? ` on ${input.vehicleTripNo}` : '';
      reasons.push({
        code: 'VEHICLE_ON_TRIP',
        field: 'vehicleId',
        message: `${vehicle.name} is already assigned${trip}.`,
        details: { vehicleStatus: vehicle.status, ...(input.vehicleTripNo ? { tripNo: input.vehicleTripNo } : {}) }
      });
    } else if (vehicle.status === VehicleStatus.IN_SHOP) {
      const service = input.maintenanceService ? ` for ${input.maintenanceService}` : '';
      reasons.push({
        code: 'VEHICLE_IN_MAINTENANCE',
        field: 'vehicleId',
        message: `${vehicle.name} is in maintenance${service}.`,
        details: { vehicleStatus: vehicle.status, ...(input.maintenanceService ? { serviceType: input.maintenanceService } : {}) }
      });
    } else if (vehicle.status === VehicleStatus.RETIRED) {
      reasons.push({
        code: 'VEHICLE_RETIRED',
        field: 'vehicleId',
        message: `${vehicle.name} is retired and cannot be assigned.`,
        details: { vehicleStatus: vehicle.status }
      });
    }

    if (input.cargoWeightKg > vehicle.capacityKg) {
      const excessKg = input.cargoWeightKg - vehicle.capacityKg;
      reasons.push({
        code: 'CARGO_OVER_CAPACITY',
        field: 'cargoWeightKg',
        message: `Cargo exceeds ${vehicle.name}'s capacity by ${number(excessKg)} kg.`,
        details: { cargoWeightKg: input.cargoWeightKg, capacityKg: vehicle.capacityKg, excessKg }
      });
    }
  }

  if (!driver) {
    reasons.push({ code: 'DRIVER_NOT_FOUND', field: 'driverId', message: 'The selected driver no longer exists.' });
  } else {
    if (driver.status === DriverStatus.ON_TRIP) {
      const trip = input.driverTripNo ? ` on ${input.driverTripNo}` : '';
      reasons.push({
        code: 'DRIVER_ON_TRIP',
        field: 'driverId',
        message: `${driver.name} is already assigned${trip}.`,
        details: { driverStatus: driver.status, ...(input.driverTripNo ? { tripNo: input.driverTripNo } : {}) }
      });
    } else if (driver.status === DriverStatus.OFF_DUTY) {
      reasons.push({
        code: 'DRIVER_OFF_DUTY',
        field: 'driverId',
        message: `${driver.name} is off duty.`,
        details: { driverStatus: driver.status }
      });
    } else if (driver.status === DriverStatus.SUSPENDED) {
      reasons.push({
        code: 'DRIVER_SUSPENDED',
        field: 'driverId',
        message: `${driver.name} is suspended.`,
        details: { driverStatus: driver.status }
      });
    }

    if (driver.licenseExpiry <= now) {
      reasons.push({
        code: 'LICENSE_EXPIRED',
        field: 'driverId',
        message: `${driver.name}'s licence expired on ${day(driver.licenseExpiry)}.`,
        details: { expiryDate: day(driver.licenseExpiry) }
      });
    }

    if (vehicle && driver.licenseCategory !== vehicle.requiredLicenseCategory) {
      reasons.push({
        code: 'LICENSE_CATEGORY_MISMATCH',
        field: 'driverId',
        message: `${vehicle.name} requires a ${vehicle.requiredLicenseCategory} licence; ${driver.name} holds ${driver.licenseCategory}.`,
        details: { requiredCategory: vehicle.requiredLicenseCategory, driverCategory: driver.licenseCategory }
      });
    }
  }

  return reasons;
}

export class AssignmentEligibilityError extends Error {
  readonly status = 409;
  readonly code = 'ASSIGNMENT_FAILED';

  constructor(readonly reasons: AssignmentFailureReason[]) {
    super(`Assignment failed for ${reasons.length} ${reasons.length === 1 ? 'reason' : 'reasons'}.`);
    this.name = 'AssignmentEligibilityError';
  }
}

export function assertAssignmentEligible(input: AssignmentEligibilityInput): void {
  const reasons = evaluateAssignment(input);
  if (reasons.length) throw new AssignmentEligibilityError(reasons);
}
