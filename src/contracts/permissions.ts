import type { AppRole } from "./domain";

export const PERMISSIONS = [
  "dashboard.read",
  "vehicle.read",
  "vehicle.manage",
  "maintenance.read",
  "maintenance.manage",
  "driver.read",
  "driver.manage_compliance",
  "trip.read",
  "trip.manage",
  "fuel.read",
  "fuel.create",
  "fuel.manage",
  "expense.read",
  "expense.manage",
  "report.read",
  "report.export_csv",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<AppRole, readonly Permission[]> = {
  fleet_manager: [
    "dashboard.read",
    "vehicle.read",
    "vehicle.manage",
    "maintenance.read",
    "maintenance.manage",
    "driver.read",
    "trip.read",
    "fuel.read",
    "fuel.create",
    "expense.read",
    "report.read",
  ],
  dispatcher: [
    "dashboard.read",
    "vehicle.read",
    "maintenance.read",
    "driver.read",
    "trip.read",
    "trip.manage",
    "fuel.read",
    "fuel.create",
    "expense.read",
    "report.read",
  ],
  safety_officer: [
    "dashboard.read",
    "vehicle.read",
    "maintenance.read",
    "driver.read",
    "driver.manage_compliance",
    "trip.read",
    "fuel.read",
    "expense.read",
    "report.read",
  ],
  financial_analyst: [
    "dashboard.read",
    "vehicle.read",
    "maintenance.read",
    "driver.read",
    "trip.read",
    "fuel.read",
    "fuel.manage",
    "expense.read",
    "expense.manage",
    "report.read",
    "report.export_csv",
  ],
};

export function roleHasPermission(
  role: AppRole,
  permission: Permission,
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
