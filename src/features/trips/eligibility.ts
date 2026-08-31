import { isLicenseValidForDispatch } from "../drivers";
import type { DriverRecord, ISODateString } from "../drivers";
import type { VehicleRecord } from "../fleet";
import type { DispatchBlocker } from "./types";

export function getVehicleDispatchBlockers(
  vehicle: VehicleRecord,
  cargoWeightKg?: number,
): DispatchBlocker[] {
  const blockers: DispatchBlocker[] = [];

  if (vehicle.archivedAt !== null) {
    blockers.push({
      resourceKind: "vehicle",
      resourceId: vehicle.id,
      code: "VEHICLE_ARCHIVED",
      message: `${vehicle.registrationNumber} is archived and cannot be dispatched.`,
      recovery: "Choose an active vehicle from the fleet registry.",
    });
  }

  if (vehicle.status === "retired") {
    blockers.push({
      resourceKind: "vehicle",
      resourceId: vehicle.id,
      code: "VEHICLE_RETIRED",
      message: `${vehicle.registrationNumber} is Retired and cannot be dispatched.`,
      recovery: "Choose an Available vehicle that is not retired.",
    });
  }

  if (vehicle.status === "in_shop") {
    blockers.push({
      resourceKind: "vehicle",
      resourceId: vehicle.id,
      code: "VEHICLE_IN_MAINTENANCE",
      message: `${vehicle.registrationNumber} is in maintenance and cannot be dispatched.`,
      recovery: "Close the maintenance log or choose another vehicle.",
    });
  }

  if (vehicle.status === "on_trip") {
    blockers.push({
      resourceKind: "vehicle",
      resourceId: vehicle.id,
      code: "VEHICLE_ON_TRIP",
      message: `${vehicle.registrationNumber} is already assigned to an active trip.`,
      recovery: "Complete or cancel the active trip, then retry dispatch.",
    });
  }

  if (cargoWeightKg !== undefined && cargoWeightKg > vehicle.maxLoadKg) {
    blockers.push({
      resourceKind: "vehicle",
      resourceId: vehicle.id,
      code: "CARGO_EXCEEDS_CAPACITY",
      message: `Cargo is ${cargoWeightKg} kg; ${vehicle.registrationNumber} supports up to ${vehicle.maxLoadKg} kg.`,
      recovery: "Reduce cargo weight or choose a vehicle with enough capacity.",
    });
  }

  return blockers;
}

export function getDriverDispatchBlockers(
  driver: DriverRecord,
  dispatchDate: ISODateString,
): DispatchBlocker[] {
  const blockers: DispatchBlocker[] = [];

  if (driver.archivedAt !== null) {
    blockers.push({
      resourceKind: "driver",
      resourceId: driver.id,
      code: "DRIVER_ARCHIVED",
      message: `${driver.name} is archived and cannot be dispatched.`,
      recovery: "Choose an active driver from the driver registry.",
    });
  }

  if (driver.status === "suspended") {
    blockers.push({
      resourceKind: "driver",
      resourceId: driver.id,
      code: "DRIVER_SUSPENDED",
      message: `${driver.name} is Suspended and cannot be dispatched.`,
      recovery:
        "Resolve the driver compliance status or choose another driver.",
    });
  }

  if (driver.status === "off_duty") {
    blockers.push({
      resourceKind: "driver",
      resourceId: driver.id,
      code: "DRIVER_OFF_DUTY",
      message: `${driver.name} is Off Duty and cannot be dispatched.`,
      recovery: "Set the driver Available or choose another driver.",
    });
  }

  if (driver.status === "on_trip") {
    blockers.push({
      resourceKind: "driver",
      resourceId: driver.id,
      code: "DRIVER_ON_TRIP",
      message: `${driver.name} is already assigned to an active trip.`,
      recovery: "Complete or cancel the active trip, then retry dispatch.",
    });
  }

  if (!isLicenseValidForDispatch(driver, dispatchDate)) {
    blockers.push({
      resourceKind: "driver",
      resourceId: driver.id,
      code: "DRIVER_LICENSE_EXPIRED",
      message: `${driver.name}'s licence expired on ${driver.licenseExpiryDate}.`,
      recovery: "Update the licence expiry or choose another driver.",
    });
  }

  return blockers;
}
