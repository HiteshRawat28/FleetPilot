import type {
  DomainErrorCode,
  VehicleStatus as SharedVehicleStatus,
} from "../../contracts";

export type ISODateTimeString = string;

export type VehicleStatus = SharedVehicleStatus;

export type VehicleType = "van" | "box_truck" | "flatbed" | "reefer" | "other";

export interface VehicleRecord {
  id: string;
  registrationNumber: string;
  registrationNumberNormalized: string;
  nameModel: string;
  type: VehicleType;
  maxLoadKg: number;
  odometerKm: number;
  acquisitionCost: number;
  region: string;
  status: VehicleStatus;
  archivedAt: ISODateTimeString | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
  createdBy: string | null;
}

export interface CreateVehicleInput {
  registrationNumber: string;
  nameModel: string;
  type: VehicleType;
  maxLoadKg: number;
  odometerKm: number;
  acquisitionCost: number;
  region: string;
}

export type UpdateVehicleInput = Partial<CreateVehicleInput>;

export interface VehicleFilters {
  includeArchived?: boolean;
  query?: string;
  status?: VehicleStatus;
  type?: VehicleType;
  region?: string;
}

export type VehicleErrorCode = Extract<
  DomainErrorCode,
  | "VEHICLE_NOT_FOUND"
  | "VEHICLE_ARCHIVED"
  | "DUPLICATE_REGISTRATION"
  | "INVALID_VEHICLE_FIELD"
  | "VEHICLE_ACTIVE_OPERATION"
  | "INVALID_VEHICLE_STATUS"
>;

export interface VehicleDomainError {
  code: VehicleErrorCode;
  message: string;
  field?: keyof CreateVehicleInput;
  recovery: string;
}

export type VehicleResult<T> =
  { ok: true; data: T } | { ok: false; error: VehicleDomainError };

export interface MockVehicleSeed {
  id?: string;
  registrationNumber: string;
  nameModel?: string;
  type?: VehicleType;
  maxLoadKg?: number;
  odometerKm?: number;
  acquisitionCost?: number;
  region?: string;
  status?: VehicleStatus;
  archivedAt?: ISODateTimeString | null;
  createdAt?: ISODateTimeString;
  updatedAt?: ISODateTimeString;
  createdBy?: string | null;
}
