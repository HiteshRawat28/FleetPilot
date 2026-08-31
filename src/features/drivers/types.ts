export type ISODateString = string;
export type ISODateTimeString = string;

export type DriverStatus = "available" | "on_trip" | "off_duty" | "suspended";

export interface DriverRecord {
  id: string;
  name: string;
  licenseNumber: string;
  licenseCategory: string;
  licenseExpiryDate: ISODateString;
  contactNumber: string;
  safetyScore: number;
  status: DriverStatus;
  archivedAt: ISODateTimeString | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
  createdBy: string | null;
}

export interface CreateDriverInput {
  name: string;
  licenseNumber: string;
  licenseCategory: string;
  licenseExpiryDate: ISODateString;
  contactNumber: string;
  safetyScore: number;
}

export type UpdateDriverInput = Partial<CreateDriverInput>;

export interface DriverFilters {
  includeArchived?: boolean;
  query?: string;
  status?: DriverStatus;
  licenseCategory?: string;
}

export type DriverErrorCode =
  | "DRIVER_NOT_FOUND"
  | "DRIVER_ARCHIVED"
  | "DUPLICATE_LICENSE"
  | "INVALID_DRIVER_FIELD"
  | "DRIVER_ACTIVE_OPERATION"
  | "INVALID_DRIVER_STATUS";

export interface DriverDomainError {
  code: DriverErrorCode;
  message: string;
  field?: keyof CreateDriverInput;
  recovery: string;
}

export type DriverResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: DriverDomainError };

export interface MockDriverSeed {
  id?: string;
  name: string;
  licenseNumber?: string;
  licenseCategory?: string;
  licenseExpiryDate?: ISODateString;
  contactNumber?: string;
  safetyScore?: number;
  status?: DriverStatus;
  archivedAt?: ISODateTimeString | null;
  createdAt?: ISODateTimeString;
  updatedAt?: ISODateTimeString;
  createdBy?: string | null;
}
