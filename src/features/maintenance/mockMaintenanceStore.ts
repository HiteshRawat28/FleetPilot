import type { MockFleetStore } from "../fleet";
import type {
  CloseMaintenanceInput,
  ISODateTimeString,
  MaintenanceDomainError,
  MaintenanceLogRecord,
  MaintenanceResult,
  MockMaintenanceSeed,
  OpenMaintenanceInput,
} from "./types";

const DEFAULT_MOCK_NOW = "2026-08-31T00:00:00.000Z";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function buildMockMaintenanceLog(
  seed: MockMaintenanceSeed,
  index = 0,
): MaintenanceLogRecord {
  const openedAt = seed.openedAt ?? DEFAULT_MOCK_NOW;

  return {
    id: seed.id ?? `maintenance-${index + 1}`,
    vehicleId: seed.vehicleId,
    maintenanceType: seed.maintenanceType ?? "preventive",
    description: seed.description ?? "Scheduled maintenance",
    status: seed.status ?? "active",
    openedAt,
    closedAt: seed.closedAt ?? null,
    maintenanceCostDraft: seed.maintenanceCostDraft
      ? { ...seed.maintenanceCostDraft }
      : null,
    createdBy: seed.createdBy ?? null,
  };
}

function cloneMaintenanceLog(log: MaintenanceLogRecord): MaintenanceLogRecord {
  return {
    ...log,
    maintenanceCostDraft: log.maintenanceCostDraft
      ? { ...log.maintenanceCostDraft }
      : null,
  };
}

function maintenanceError(
  error: MaintenanceDomainError,
): MaintenanceResult<never> {
  return { ok: false, error };
}

function invalidMaintenanceField(
  field: MaintenanceDomainError["field"],
  message: string,
): MaintenanceResult<never> {
  return maintenanceError({
    code: "INVALID_MAINTENANCE_FIELD",
    field,
    message,
    recovery: "Correct the maintenance field and try again.",
  });
}

function validateOpenMaintenanceInput(
  input: OpenMaintenanceInput,
): MaintenanceResult<undefined> {
  if (input.vehicleId.trim().length === 0) {
    return invalidMaintenanceField("vehicleId", "Vehicle is required.");
  }

  if (input.description.trim().length === 0) {
    return invalidMaintenanceField(
      "description",
      "Maintenance description is required.",
    );
  }

  return { ok: true, data: undefined };
}

function validateCloseMaintenanceInput(
  input: CloseMaintenanceInput,
): MaintenanceResult<undefined> {
  if (input.cost === undefined) {
    return { ok: true, data: undefined };
  }

  if (input.cost.amount < 0) {
    return invalidMaintenanceField(
      "costAmount",
      "Maintenance cost cannot be negative.",
    );
  }

  if (!ISO_DATE_PATTERN.test(input.cost.expenseDate)) {
    return invalidMaintenanceField(
      "costExpenseDate",
      "Maintenance cost date must use YYYY-MM-DD.",
    );
  }

  if (input.cost.description.trim().length === 0) {
    return invalidMaintenanceField(
      "costDescription",
      "Maintenance cost description is required.",
    );
  }

  return { ok: true, data: undefined };
}

export class MockMaintenanceStore {
  private readonly logs = new Map<string, MaintenanceLogRecord>();
  private readonly fleetStore: MockFleetStore;
  private readonly now: () => ISODateTimeString;
  private nextId: number;

  constructor(
    dependencies: { fleetStore: MockFleetStore },
    seeds: MockMaintenanceSeed[] = [],
    options: { now?: () => ISODateTimeString } = {},
  ) {
    this.fleetStore = dependencies.fleetStore;
    this.now = options.now ?? (() => new Date().toISOString());
    seeds.forEach((seed, index) => {
      const log = buildMockMaintenanceLog(seed, index);
      this.logs.set(log.id, log);
    });
    this.nextId = seeds.length + 1;
  }

  listMaintenanceLogs(): MaintenanceLogRecord[] {
    return [...this.logs.values()]
      .sort((left, right) => left.openedAt.localeCompare(right.openedAt))
      .map(cloneMaintenanceLog);
  }

  getMaintenanceLog(logId: string): MaintenanceLogRecord | undefined {
    const log = this.logs.get(logId);
    return log ? cloneMaintenanceLog(log) : undefined;
  }

  openMaintenance(
    input: OpenMaintenanceInput,
    createdBy: string | null = null,
  ): MaintenanceResult<MaintenanceLogRecord> {
    const validation = validateOpenMaintenanceInput(input);
    if (!validation.ok) return validation;

    const vehicle = this.fleetStore.getVehicle(input.vehicleId);
    if (!vehicle) {
      return maintenanceError({
        code: "VEHICLE_NOT_FOUND",
        field: "vehicleId",
        message: "Vehicle was not found.",
        recovery: "Refresh the fleet list and choose an active vehicle.",
      });
    }

    if (vehicle.archivedAt !== null) {
      return maintenanceError({
        code: "VEHICLE_ARCHIVED",
        field: "vehicleId",
        message: `${vehicle.registrationNumber} is archived and cannot enter maintenance.`,
        recovery: "Choose an active vehicle.",
      });
    }

    if (vehicle.status === "on_trip") {
      return maintenanceError({
        code: "VEHICLE_ON_TRIP",
        field: "vehicleId",
        message: `${vehicle.registrationNumber} is On Trip and cannot enter maintenance.`,
        recovery:
          "Complete or cancel the active trip before opening maintenance.",
      });
    }

    if (vehicle.status === "retired") {
      return maintenanceError({
        code: "VEHICLE_RETIRED",
        field: "vehicleId",
        message: `${vehicle.registrationNumber} is Retired and cannot enter maintenance.`,
        recovery: "Choose an Available vehicle.",
      });
    }

    if (
      vehicle.status === "in_shop" ||
      this.hasActiveMaintenance(input.vehicleId)
    ) {
      return maintenanceError({
        code: "ACTIVE_MAINTENANCE_EXISTS",
        field: "vehicleId",
        message: `${vehicle.registrationNumber} already has active maintenance.`,
        recovery: "Close the existing maintenance log before opening another.",
      });
    }

    const markedVehicle = this.fleetStore.sendVehicleToShop(input.vehicleId);
    if (!markedVehicle.ok) {
      return maintenanceError({
        code: "VEHICLE_IN_MAINTENANCE",
        field: "vehicleId",
        message: markedVehicle.error.message,
        recovery: markedVehicle.error.recovery,
      });
    }

    const log: MaintenanceLogRecord = {
      id: `maintenance-${this.nextId++}`,
      vehicleId: input.vehicleId,
      maintenanceType: input.maintenanceType,
      description: input.description.trim(),
      status: "active",
      openedAt: this.now(),
      closedAt: null,
      maintenanceCostDraft: null,
      createdBy,
    };

    this.logs.set(log.id, log);
    return { ok: true, data: cloneMaintenanceLog(log) };
  }

  closeMaintenance(
    logId: string,
    input: CloseMaintenanceInput = {},
  ): MaintenanceResult<MaintenanceLogRecord> {
    const validation = validateCloseMaintenanceInput(input);
    if (!validation.ok) return validation;

    const log = this.logs.get(logId);
    if (!log) {
      return maintenanceError({
        code: "MAINTENANCE_NOT_FOUND",
        message: "Maintenance log was not found.",
        recovery: "Refresh the maintenance queue before retrying.",
      });
    }

    if (log.status !== "active") {
      return maintenanceError({
        code: "INVALID_MAINTENANCE_TRANSITION",
        message: "Only Active maintenance can be closed.",
        recovery: "Refresh the maintenance log and choose an allowed action.",
      });
    }

    const restoredVehicle = this.fleetStore.restoreVehicleAfterMaintenance(
      log.vehicleId,
    );
    if (!restoredVehicle.ok) {
      return maintenanceError({
        code: "INVALID_MAINTENANCE_TRANSITION",
        message: restoredVehicle.error.message,
        recovery: restoredVehicle.error.recovery,
      });
    }

    const updated: MaintenanceLogRecord = {
      ...log,
      status: "closed",
      closedAt: this.now(),
      maintenanceCostDraft: input.cost
        ? {
            amount: input.cost.amount,
            expenseDate: input.cost.expenseDate,
            description: input.cost.description.trim(),
          }
        : null,
    };

    this.logs.set(logId, updated);
    return { ok: true, data: cloneMaintenanceLog(updated) };
  }

  private hasActiveMaintenance(vehicleId: string): boolean {
    return [...this.logs.values()].some(
      (log) => log.vehicleId === vehicleId && log.status === "active",
    );
  }
}
