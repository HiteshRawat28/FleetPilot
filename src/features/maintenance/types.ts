import type {
  DomainErrorCode,
  MaintenanceStatus as SharedMaintenanceStatus,
} from "../../contracts";

export type ISODateString = string;
export type ISODateTimeString = string;

export type MaintenanceStatus = SharedMaintenanceStatus;
export type MaintenanceType = "preventive" | "repair" | "inspection" | "other";

export interface MaintenanceCostDraft {
  amount: number;
  expenseDate: ISODateString;
  description: string;
}

export interface MaintenanceLogRecord {
  id: string;
  vehicleId: string;
  maintenanceType: MaintenanceType;
  description: string;
  status: MaintenanceStatus;
  openedAt: ISODateTimeString;
  closedAt: ISODateTimeString | null;
  maintenanceCostDraft: MaintenanceCostDraft | null;
  createdBy: string | null;
}

export interface OpenMaintenanceInput {
  vehicleId: string;
  maintenanceType: MaintenanceType;
  description: string;
}

export interface CloseMaintenanceInput {
  cost?: MaintenanceCostDraft;
}

export type MaintenanceErrorCode = Extract<
  DomainErrorCode,
  | "MAINTENANCE_NOT_FOUND"
  | "ACTIVE_MAINTENANCE_EXISTS"
  | "INVALID_MAINTENANCE_FIELD"
  | "INVALID_MAINTENANCE_TRANSITION"
  | "VEHICLE_NOT_FOUND"
  | "VEHICLE_ARCHIVED"
  | "VEHICLE_ON_TRIP"
  | "VEHICLE_RETIRED"
  | "VEHICLE_IN_MAINTENANCE"
>;

export type MaintenanceField =
  | keyof OpenMaintenanceInput
  | "costAmount"
  | "costExpenseDate"
  | "costDescription";

export interface MaintenanceDomainError {
  code: MaintenanceErrorCode;
  message: string;
  field?: MaintenanceField;
  recovery: string;
}

export type MaintenanceResult<T> =
  { ok: true; data: T } | { ok: false; error: MaintenanceDomainError };

export interface MockMaintenanceSeed {
  id?: string;
  vehicleId: string;
  maintenanceType?: MaintenanceType;
  description?: string;
  status?: MaintenanceStatus;
  openedAt?: ISODateTimeString;
  closedAt?: ISODateTimeString | null;
  maintenanceCostDraft?: MaintenanceCostDraft | null;
  createdBy?: string | null;
}
