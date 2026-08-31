import type { Database } from "./database.types";

type Enums = Database["public"]["Enums"];

export type AppRole = Enums["user_role"];
export type VehicleStatus = Enums["vehicle_status"];
export type DriverStatus = Enums["driver_status"];
export type TripStatus = Enums["trip_status"];
export type MaintenanceStatus = Enums["maintenance_status"];
export type ExpenseCategory = Enums["expense_category"];

export const APP_ROLES = [
  "fleet_manager",
  "dispatcher",
  "safety_officer",
  "financial_analyst",
] as const satisfies readonly AppRole[];

export const VEHICLE_STATUSES = [
  "available",
  "on_trip",
  "in_shop",
  "retired",
] as const satisfies readonly VehicleStatus[];

export const DRIVER_STATUSES = [
  "available",
  "on_trip",
  "off_duty",
  "suspended",
] as const satisfies readonly DriverStatus[];

export const TRIP_STATUSES = [
  "draft",
  "dispatched",
  "completed",
  "cancelled",
] as const satisfies readonly TripStatus[];

export const MAINTENANCE_STATUSES = [
  "active",
  "closed",
] as const satisfies readonly MaintenanceStatus[];

export const EXPENSE_CATEGORIES = [
  "maintenance",
  "toll",
  "other",
] as const satisfies readonly ExpenseCategory[];

export const ROLE_LABELS: Record<AppRole, string> = {
  fleet_manager: "Fleet Manager",
  dispatcher: "Trip Operator",
  safety_officer: "Safety Officer",
  financial_analyst: "Financial Analyst",
};
