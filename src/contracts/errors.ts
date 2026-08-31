export const DOMAIN_ERROR_MESSAGES = {
  AUTH_REQUIRED: "Sign in to continue.",
  FORBIDDEN: "You do not have permission to perform this action.",
  RECORD_NOT_FOUND: "The requested record no longer exists.",
  VALIDATION_FAILED: "Review the highlighted values and try again.",
  DUPLICATE_REGISTRATION: "A vehicle with this registration number already exists.",
  DUPLICATE_LICENSE: "A driver with this licence number already exists.",
  INVALID_TRANSITION: "This record cannot move to the requested status.",
  VEHICLE_NOT_AVAILABLE: "The selected vehicle is not available.",
  VEHICLE_ARCHIVED: "The selected vehicle is archived.",
  VEHICLE_RETIRED: "The selected vehicle is retired.",
  VEHICLE_IN_MAINTENANCE: "The selected vehicle is in maintenance.",
  VEHICLE_ALREADY_ON_TRIP: "The selected vehicle is already assigned to a trip.",
  DRIVER_NOT_AVAILABLE: "The selected driver is not available.",
  DRIVER_ARCHIVED: "The selected driver is archived.",
  DRIVER_SUSPENDED: "The selected driver is suspended.",
  DRIVER_LICENSE_EXPIRED: "The selected driver's licence has expired.",
  DRIVER_ALREADY_ON_TRIP: "The selected driver is already assigned to a trip.",
  CARGO_EXCEEDS_CAPACITY: "Cargo weight exceeds the vehicle's maximum capacity.",
  ODOMETER_DECREASED: "Final odometer cannot be lower than the current odometer.",
  ACTIVE_MAINTENANCE_EXISTS: "This vehicle already has an active maintenance record.",
  MAINTENANCE_NOT_ACTIVE: "This maintenance record is not active.",
  CONCURRENT_MODIFICATION: "The record changed while you were working. Refresh and try again.",
  INTERNAL_ERROR: "The operation could not be completed. Try again.",
} as const;

export type DomainErrorCode = keyof typeof DOMAIN_ERROR_MESSAGES;

export type DomainError = {
  code: DomainErrorCode;
  message: string;
  field?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export function isDomainErrorCode(value: string): value is DomainErrorCode {
  return Object.prototype.hasOwnProperty.call(DOMAIN_ERROR_MESSAGES, value);
}
