import type { Database } from "./database.types";

type Tables = Database["public"]["Tables"];

export type Profile = Tables["profiles"]["Row"];
export type ProfileInsert = Tables["profiles"]["Insert"];
export type ProfileUpdate = Tables["profiles"]["Update"];

export type Vehicle = Tables["vehicles"]["Row"];
export type VehicleInsert = Tables["vehicles"]["Insert"];
export type VehicleUpdate = Tables["vehicles"]["Update"];

export type Driver = Tables["drivers"]["Row"];
export type DriverInsert = Tables["drivers"]["Insert"];
export type DriverUpdate = Tables["drivers"]["Update"];

export type Trip = Tables["trips"]["Row"];
export type TripInsert = Tables["trips"]["Insert"];
export type TripUpdate = Tables["trips"]["Update"];

export type MaintenanceLog = Tables["maintenance_logs"]["Row"];
export type MaintenanceLogInsert = Tables["maintenance_logs"]["Insert"];
export type MaintenanceLogUpdate = Tables["maintenance_logs"]["Update"];

export type FuelLog = Tables["fuel_logs"]["Row"];
export type FuelLogInsert = Tables["fuel_logs"]["Insert"];
export type FuelLogUpdate = Tables["fuel_logs"]["Update"];

export type Expense = Tables["expenses"]["Row"];
export type ExpenseInsert = Tables["expenses"]["Insert"];
export type ExpenseUpdate = Tables["expenses"]["Update"];
