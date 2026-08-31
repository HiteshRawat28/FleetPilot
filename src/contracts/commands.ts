import type {
  DriverStatus,
  MaintenanceStatus,
  TripStatus,
  VehicleStatus,
} from "./domain";
import type { DomainError } from "./errors";

export const RPC_NAMES = {
  dispatchTrip: "dispatch_trip",
  completeTrip: "complete_trip",
  cancelTrip: "cancel_trip",
  openMaintenance: "open_maintenance",
  closeMaintenance: "close_maintenance",
} as const;

export type RpcName = (typeof RPC_NAMES)[keyof typeof RPC_NAMES];

export type CommandSuccess<T> = {
  ok: true;
  data: T;
};

export type CommandFailure = {
  ok: false;
  error: DomainError;
};

export type CommandResult<T> = CommandSuccess<T> | CommandFailure;

export type DispatchTripArgs = {
  p_trip_id: string;
};

export type CompleteTripArgs = {
  p_trip_id: string;
  p_final_odometer_km: number;
  p_fuel_liters?: number | null;
  p_fuel_cost?: number | null;
};

export type CancelTripArgs = {
  p_trip_id: string;
};

export type OpenMaintenanceArgs = {
  p_vehicle_id: string;
  p_maintenance_type: string;
  p_description?: string | null;
};

export type CloseMaintenanceArgs = {
  p_maintenance_log_id: string;
  p_maintenance_cost?: number | null;
};

export type TripTransitionData = {
  trip_id: string;
  trip_status: TripStatus;
  vehicle_id: string;
  vehicle_status: VehicleStatus;
  driver_id: string;
  driver_status: DriverStatus;
};

export type MaintenanceTransitionData = {
  maintenance_log_id: string;
  maintenance_status: MaintenanceStatus;
  vehicle_id: string;
  vehicle_status: VehicleStatus;
  maintenance_expense_id: string | null;
};

export type RpcArgsByName = {
  dispatch_trip: DispatchTripArgs;
  complete_trip: CompleteTripArgs;
  cancel_trip: CancelTripArgs;
  open_maintenance: OpenMaintenanceArgs;
  close_maintenance: CloseMaintenanceArgs;
};

export type RpcDataByName = {
  dispatch_trip: TripTransitionData;
  complete_trip: TripTransitionData;
  cancel_trip: TripTransitionData;
  open_maintenance: MaintenanceTransitionData;
  close_maintenance: MaintenanceTransitionData;
};

export type RpcResultByName = {
  [Name in RpcName]: CommandResult<RpcDataByName[Name]>;
};
