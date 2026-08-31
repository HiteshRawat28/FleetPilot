import type { DriverRecord, ISODateString } from "../drivers";
import type { VehicleRecord } from "../fleet";

export type ISODateTimeString = string;

export type TripStatus = "draft" | "dispatched" | "completed" | "cancelled";

export interface DraftTripInput {
  source: string;
  destination: string;
  vehicleId: string;
  driverId: string;
  cargoWeightKg: number;
  plannedDistanceKm: number;
  revenue: number;
}

export interface CompletionFuelDraft {
  liters: number;
  cost: number;
  loggedDate: ISODateString;
}

export interface TripRecord extends DraftTripInput {
  id: string;
  status: TripStatus;
  startOdometerKm: number | null;
  finalOdometerKm: number | null;
  actualDistanceKm: number | null;
  completionFuelDraft: CompletionFuelDraft | null;
  dispatchedAt: ISODateTimeString | null;
  completedAt: ISODateTimeString | null;
  cancelledAt: ISODateTimeString | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
  createdBy: string | null;
}

export type TripOperationErrorCode =
  | "TRIP_NOT_FOUND"
  | "INVALID_TRIP_FIELD"
  | "INVALID_TRIP_TRANSITION"
  | "VEHICLE_NOT_FOUND"
  | "VEHICLE_ARCHIVED"
  | "VEHICLE_RETIRED"
  | "VEHICLE_IN_MAINTENANCE"
  | "VEHICLE_ON_TRIP"
  | "CARGO_EXCEEDS_CAPACITY"
  | "DRIVER_NOT_FOUND"
  | "DRIVER_ARCHIVED"
  | "DRIVER_SUSPENDED"
  | "DRIVER_OFF_DUTY"
  | "DRIVER_ON_TRIP"
  | "DRIVER_LICENSE_EXPIRED"
  | "RESOURCE_ALREADY_ASSIGNED"
  | "FINAL_ODOMETER_TOO_LOW"
  | "INVALID_FUEL_FIELD";

export type TripField = keyof DraftTripInput | "finalOdometerKm" | "fuelLiters" | "fuelCost";

export interface DispatchBlocker {
  resourceKind: "vehicle" | "driver" | "trip";
  resourceId: string;
  code: TripOperationErrorCode;
  message: string;
  recovery: string;
}

export interface EligibleResources {
  eligibleVehicles: VehicleRecord[];
  blockedVehicles: DispatchBlocker[];
  eligibleDrivers: DriverRecord[];
  blockedDrivers: DispatchBlocker[];
}

export interface TripOperationError {
  code: TripOperationErrorCode;
  message: string;
  field?: TripField;
  recovery: string;
  blockers?: DispatchBlocker[];
}

export type TripResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: TripOperationError };

export interface MockTripSeed extends Partial<DraftTripInput> {
  id?: string;
  source: string;
  destination: string;
  vehicleId: string;
  driverId: string;
  cargoWeightKg: number;
  plannedDistanceKm?: number;
  revenue?: number;
  status?: TripStatus;
  startOdometerKm?: number | null;
  finalOdometerKm?: number | null;
  actualDistanceKm?: number | null;
  completionFuelDraft?: CompletionFuelDraft | null;
  dispatchedAt?: ISODateTimeString | null;
  completedAt?: ISODateTimeString | null;
  cancelledAt?: ISODateTimeString | null;
  createdAt?: ISODateTimeString;
  updatedAt?: ISODateTimeString;
  createdBy?: string | null;
}

export interface ListEligibleResourcesInput {
  cargoWeightKg?: number;
  dispatchDate: ISODateString;
}

export interface CompleteTripInput {
  finalOdometerKm: number;
  fuel?: CompletionFuelDraft;
}
