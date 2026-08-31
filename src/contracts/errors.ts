export const DOMAIN_ERROR_MESSAGES = {
  AUTH_REQUIRED: "Sign in to continue.",
  FORBIDDEN: "You do not have permission to perform this action.",
  RECORD_NOT_FOUND: "The requested record no longer exists.",
  VALIDATION_FAILED: "Review the highlighted values and try again.",
  CONCURRENT_MODIFICATION:
    "The record changed while you were working. Refresh and try again.",
  DUPLICATE_REGISTRATION:
    "A vehicle with this registration number already exists.",
  VEHICLE_NOT_FOUND: "The requested vehicle no longer exists.",
  INVALID_VEHICLE_FIELD: "Review the vehicle details and try again.",
  VEHICLE_ACTIVE_OPERATION:
    "The vehicle has active work that must be completed first.",
  INVALID_VEHICLE_STATUS: "The vehicle cannot move to the requested status.",
  VEHICLE_ARCHIVED: "The selected vehicle is archived.",
  VEHICLE_RETIRED: "The selected vehicle is retired.",
  VEHICLE_IN_MAINTENANCE: "The selected vehicle is in maintenance.",
  VEHICLE_ON_TRIP: "The selected vehicle is already assigned to a trip.",
  DUPLICATE_LICENSE: "A driver with this licence number already exists.",
  DRIVER_NOT_FOUND: "The requested driver no longer exists.",
  INVALID_DRIVER_FIELD: "Review the driver details and try again.",
  DRIVER_ACTIVE_OPERATION:
    "The driver has an active trip that must be completed first.",
  INVALID_DRIVER_STATUS: "The driver cannot move to the requested status.",
  DRIVER_ARCHIVED: "The selected driver is archived.",
  DRIVER_SUSPENDED: "The selected driver is suspended.",
  DRIVER_OFF_DUTY: "The selected driver is off duty.",
  DRIVER_ON_TRIP: "The selected driver is already assigned to a trip.",
  DRIVER_LICENSE_EXPIRED: "The selected driver's licence has expired.",
  TRIP_NOT_FOUND: "The requested trip no longer exists.",
  INVALID_TRIP_FIELD: "Review the trip details and try again.",
  INVALID_TRIP_TRANSITION: "The trip cannot move to the requested status.",
  CARGO_EXCEEDS_CAPACITY:
    "Cargo weight exceeds the vehicle's maximum capacity.",
  RESOURCE_ALREADY_ASSIGNED:
    "The selected vehicle or driver is already assigned.",
  FINAL_ODOMETER_TOO_LOW:
    "Final odometer cannot be lower than the current odometer.",
  INVALID_FUEL_FIELD: "Review the fuel details and try again.",
  MAINTENANCE_NOT_FOUND: "The requested maintenance record no longer exists.",
  ACTIVE_MAINTENANCE_EXISTS:
    "This vehicle already has an active maintenance record.",
  INVALID_MAINTENANCE_FIELD: "Review the maintenance details and try again.",
  INVALID_MAINTENANCE_TRANSITION:
    "The maintenance record cannot move to the requested status.",
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
