import type {
  CreateVehicleInput,
  ISODateTimeString,
  MockVehicleSeed,
  UpdateVehicleInput,
  VehicleDomainError,
  VehicleFilters,
  VehicleRecord,
  VehicleResult,
  VehicleStatus,
} from "./types";

const DEFAULT_MOCK_NOW = "2026-08-31T00:00:00.000Z";

export function normalizeRegistration(registrationNumber: string): string {
  return registrationNumber.trim().toUpperCase();
}

export function buildMockVehicle(
  seed: MockVehicleSeed,
  index = 0,
): VehicleRecord {
  const createdAt = seed.createdAt ?? DEFAULT_MOCK_NOW;
  const updatedAt = seed.updatedAt ?? createdAt;
  const registrationNumber = seed.registrationNumber.trim();

  return {
    id: seed.id ?? `vehicle-${index + 1}`,
    registrationNumber,
    registrationNumberNormalized: normalizeRegistration(registrationNumber),
    nameModel: seed.nameModel ?? registrationNumber,
    type: seed.type ?? "van",
    maxLoadKg: seed.maxLoadKg ?? 500,
    odometerKm: seed.odometerKm ?? 0,
    acquisitionCost: seed.acquisitionCost ?? 0,
    region: seed.region ?? "Demo",
    status: seed.status ?? "available",
    archivedAt: seed.archivedAt ?? null,
    createdAt,
    updatedAt,
    createdBy: seed.createdBy ?? null,
  };
}

function cloneVehicle(vehicle: VehicleRecord): VehicleRecord {
  return { ...vehicle };
}

function vehicleError(error: VehicleDomainError): VehicleResult<never> {
  return { ok: false, error };
}

function invalidField(
  field: keyof CreateVehicleInput,
  message: string,
  recovery = "Correct the vehicle field and try again.",
): VehicleResult<never> {
  return vehicleError({
    code: "INVALID_VEHICLE_FIELD",
    field,
    message,
    recovery,
  });
}

function validateRequiredText(
  field: "registrationNumber" | "nameModel" | "region",
  value: string | undefined,
): VehicleResult<undefined> {
  if (value === undefined) {
    return { ok: true, data: undefined };
  }

  if (value.trim().length === 0) {
    return invalidField(field, `${field} is required.`);
  }

  return { ok: true, data: undefined };
}

function validateVehicleNumbers(
  input: UpdateVehicleInput,
): VehicleResult<undefined> {
  if (input.maxLoadKg !== undefined && input.maxLoadKg <= 0) {
    return invalidField("maxLoadKg", "Maximum load must be greater than 0 kg.");
  }

  if (input.odometerKm !== undefined && input.odometerKm < 0) {
    return invalidField("odometerKm", "Odometer cannot be negative.");
  }

  if (input.acquisitionCost !== undefined && input.acquisitionCost < 0) {
    return invalidField(
      "acquisitionCost",
      "Acquisition cost cannot be negative.",
    );
  }

  return { ok: true, data: undefined };
}

function validateCreateVehicleInput(
  input: CreateVehicleInput,
): VehicleResult<undefined> {
  const registration = validateRequiredText(
    "registrationNumber",
    input.registrationNumber,
  );
  if (!registration.ok) return registration;

  const nameModel = validateRequiredText("nameModel", input.nameModel);
  if (!nameModel.ok) return nameModel;

  const region = validateRequiredText("region", input.region);
  if (!region.ok) return region;

  return validateVehicleNumbers(input);
}

function validateUpdateVehicleInput(
  input: UpdateVehicleInput,
): VehicleResult<undefined> {
  const registration = validateRequiredText(
    "registrationNumber",
    input.registrationNumber,
  );
  if (!registration.ok) return registration;

  const nameModel = validateRequiredText("nameModel", input.nameModel);
  if (!nameModel.ok) return nameModel;

  const region = validateRequiredText("region", input.region);
  if (!region.ok) return region;

  return validateVehicleNumbers(input);
}

export class MockFleetStore {
  private readonly vehicles = new Map<string, VehicleRecord>();
  private readonly now: () => ISODateTimeString;
  private nextId: number;

  constructor(
    seeds: MockVehicleSeed[] = [],
    options: { now?: () => ISODateTimeString } = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    seeds.forEach((seed, index) => {
      const vehicle = buildMockVehicle(seed, index);
      this.vehicles.set(vehicle.id, vehicle);
    });
    this.nextId = seeds.length + 1;
  }

  listVehicles(filters: VehicleFilters = {}): VehicleRecord[] {
    const query = filters.query?.trim().toLowerCase();

    return [...this.vehicles.values()]
      .filter(
        (vehicle) => filters.includeArchived || vehicle.archivedAt === null,
      )
      .filter(
        (vehicle) =>
          filters.status === undefined || vehicle.status === filters.status,
      )
      .filter(
        (vehicle) =>
          filters.type === undefined || vehicle.type === filters.type,
      )
      .filter(
        (vehicle) =>
          filters.region === undefined || vehicle.region === filters.region,
      )
      .filter((vehicle) => {
        if (!query) return true;
        return (
          vehicle.registrationNumber.toLowerCase().includes(query) ||
          vehicle.nameModel.toLowerCase().includes(query) ||
          vehicle.region.toLowerCase().includes(query)
        );
      })
      .sort((left, right) =>
        left.registrationNumber.localeCompare(right.registrationNumber),
      )
      .map(cloneVehicle);
  }

  getVehicle(vehicleId: string): VehicleRecord | undefined {
    const vehicle = this.vehicles.get(vehicleId);
    return vehicle ? cloneVehicle(vehicle) : undefined;
  }

  createVehicle(
    input: CreateVehicleInput,
    createdBy: string | null = null,
  ): VehicleResult<VehicleRecord> {
    const validation = validateCreateVehicleInput(input);
    if (!validation.ok) return validation;

    const registrationNumberNormalized = normalizeRegistration(
      input.registrationNumber,
    );
    if (this.hasRegistration(registrationNumberNormalized)) {
      return vehicleError({
        code: "DUPLICATE_REGISTRATION",
        field: "registrationNumber",
        message: `Vehicle registration ${input.registrationNumber.trim()} is already in use.`,
        recovery: "Use a unique registration number before saving.",
      });
    }

    const now = this.now();
    const vehicle: VehicleRecord = {
      id: `vehicle-${this.nextId++}`,
      registrationNumber: input.registrationNumber.trim(),
      registrationNumberNormalized,
      nameModel: input.nameModel.trim(),
      type: input.type,
      maxLoadKg: input.maxLoadKg,
      odometerKm: input.odometerKm,
      acquisitionCost: input.acquisitionCost,
      region: input.region.trim(),
      status: "available",
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      createdBy,
    };

    this.vehicles.set(vehicle.id, vehicle);
    return { ok: true, data: cloneVehicle(vehicle) };
  }

  updateVehicle(
    vehicleId: string,
    input: UpdateVehicleInput,
  ): VehicleResult<VehicleRecord> {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle) {
      return vehicleError({
        code: "VEHICLE_NOT_FOUND",
        message: "Vehicle was not found.",
        recovery: "Refresh the fleet list and choose an active vehicle.",
      });
    }

    if (vehicle.archivedAt !== null) {
      return vehicleError({
        code: "VEHICLE_ARCHIVED",
        message: `${vehicle.registrationNumber} is archived and cannot be edited.`,
        recovery:
          "Restore or create a new vehicle record before making changes.",
      });
    }

    const validation = validateUpdateVehicleInput(input);
    if (!validation.ok) return validation;

    const nextRegistration =
      input.registrationNumber?.trim() ?? vehicle.registrationNumber;
    const nextRegistrationNormalized = normalizeRegistration(nextRegistration);
    if (this.hasRegistration(nextRegistrationNormalized, vehicleId)) {
      return vehicleError({
        code: "DUPLICATE_REGISTRATION",
        field: "registrationNumber",
        message: `Vehicle registration ${nextRegistration} is already in use.`,
        recovery: "Use a unique registration number before saving.",
      });
    }

    const updated: VehicleRecord = {
      ...vehicle,
      registrationNumber: nextRegistration,
      registrationNumberNormalized: nextRegistrationNormalized,
      nameModel: input.nameModel?.trim() ?? vehicle.nameModel,
      type: input.type ?? vehicle.type,
      maxLoadKg: input.maxLoadKg ?? vehicle.maxLoadKg,
      odometerKm: input.odometerKm ?? vehicle.odometerKm,
      acquisitionCost: input.acquisitionCost ?? vehicle.acquisitionCost,
      region: input.region?.trim() ?? vehicle.region,
      updatedAt: this.now(),
    };

    this.vehicles.set(vehicleId, updated);
    return { ok: true, data: cloneVehicle(updated) };
  }

  archiveVehicle(vehicleId: string): VehicleResult<VehicleRecord> {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle) {
      return vehicleError({
        code: "VEHICLE_NOT_FOUND",
        message: "Vehicle was not found.",
        recovery: "Refresh the fleet list and choose an active vehicle.",
      });
    }

    if (vehicle.status === "on_trip" || vehicle.status === "in_shop") {
      return vehicleError({
        code: "VEHICLE_ACTIVE_OPERATION",
        message: `${vehicle.registrationNumber} is ${describeVehicleStatus(vehicle.status)} and cannot be archived.`,
        recovery:
          "Complete the active trip or close maintenance before archiving.",
      });
    }

    const updated = {
      ...vehicle,
      archivedAt: this.now(),
      updatedAt: this.now(),
    };
    this.vehicles.set(vehicleId, updated);
    return { ok: true, data: cloneVehicle(updated) };
  }

  reserveVehicleForTrip(vehicleId: string): VehicleResult<VehicleRecord> {
    return this.transitionVehicleStatus(vehicleId, "available", "on_trip", {
      code: "INVALID_VEHICLE_STATUS",
      message: "Vehicle must be Available before dispatch.",
      recovery: "Choose a vehicle that is Available and active.",
    });
  }

  releaseVehicleFromTrip(vehicleId: string): VehicleResult<VehicleRecord> {
    return this.transitionVehicleStatus(vehicleId, "on_trip", "available", {
      code: "INVALID_VEHICLE_STATUS",
      message: "Vehicle is not currently On Trip.",
      recovery: "Refresh the trip and vehicle status before retrying.",
    });
  }

  sendVehicleToShop(vehicleId: string): VehicleResult<VehicleRecord> {
    return this.transitionVehicleStatus(vehicleId, "available", "in_shop", {
      code: "INVALID_VEHICLE_STATUS",
      message: "Only Available vehicles can enter maintenance.",
      recovery: "Complete active work or choose another vehicle.",
    });
  }

  restoreVehicleAfterMaintenance(
    vehicleId: string,
  ): VehicleResult<VehicleRecord> {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle) {
      return vehicleError({
        code: "VEHICLE_NOT_FOUND",
        message: "Vehicle was not found.",
        recovery: "Refresh the maintenance queue before retrying.",
      });
    }

    if (vehicle.archivedAt !== null) {
      return vehicleError({
        code: "VEHICLE_ARCHIVED",
        message: `${vehicle.registrationNumber} is archived.`,
        recovery: "Review the vehicle record before closing maintenance.",
      });
    }

    if (vehicle.status === "retired") {
      const updated = { ...vehicle, updatedAt: this.now() };
      this.vehicles.set(vehicleId, updated);
      return { ok: true, data: cloneVehicle(updated) };
    }

    if (vehicle.status !== "in_shop") {
      return vehicleError({
        code: "INVALID_VEHICLE_STATUS",
        message: "Vehicle is not In Shop.",
        recovery: "Refresh the maintenance queue before retrying.",
      });
    }

    const updated = {
      ...vehicle,
      status: "available" as const,
      updatedAt: this.now(),
    };
    this.vehicles.set(vehicleId, updated);
    return { ok: true, data: cloneVehicle(updated) };
  }

  retireVehicle(vehicleId: string): VehicleResult<VehicleRecord> {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle) {
      return vehicleError({
        code: "VEHICLE_NOT_FOUND",
        message: "Vehicle was not found.",
        recovery: "Refresh the fleet list and choose an active vehicle.",
      });
    }

    if (vehicle.archivedAt !== null) {
      return vehicleError({
        code: "VEHICLE_ARCHIVED",
        message: `${vehicle.registrationNumber} is archived.`,
        recovery: "Restore or create a new vehicle record before retiring.",
      });
    }

    if (vehicle.status === "on_trip") {
      return vehicleError({
        code: "VEHICLE_ACTIVE_OPERATION",
        message: `${vehicle.registrationNumber} is On Trip and cannot be retired.`,
        recovery:
          "Complete or cancel the active trip before retiring the vehicle.",
      });
    }

    const updated = {
      ...vehicle,
      status: "retired" as const,
      updatedAt: this.now(),
    };
    this.vehicles.set(vehicleId, updated);
    return { ok: true, data: cloneVehicle(updated) };
  }

  private hasRegistration(
    registrationNumberNormalized: string,
    exceptVehicleId?: string,
  ): boolean {
    return [...this.vehicles.values()].some(
      (vehicle) =>
        vehicle.id !== exceptVehicleId &&
        vehicle.registrationNumberNormalized === registrationNumberNormalized,
    );
  }

  private transitionVehicleStatus(
    vehicleId: string,
    expectedStatus: VehicleStatus,
    nextStatus: VehicleStatus,
    invalidStatusError: VehicleDomainError,
  ): VehicleResult<VehicleRecord> {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle) {
      return vehicleError({
        code: "VEHICLE_NOT_FOUND",
        message: "Vehicle was not found.",
        recovery: "Refresh the fleet list and choose an active vehicle.",
      });
    }

    if (vehicle.archivedAt !== null) {
      return vehicleError({
        code: "VEHICLE_ARCHIVED",
        message: `${vehicle.registrationNumber} is archived.`,
        recovery: "Choose an active vehicle.",
      });
    }

    if (vehicle.status !== expectedStatus) {
      return vehicleError(invalidStatusError);
    }

    const updated = { ...vehicle, status: nextStatus, updatedAt: this.now() };
    this.vehicles.set(vehicleId, updated);
    return { ok: true, data: cloneVehicle(updated) };
  }
}

function describeVehicleStatus(status: VehicleStatus): string {
  switch (status) {
    case "available":
      return "Available";
    case "on_trip":
      return "On Trip";
    case "in_shop":
      return "In Shop";
    case "retired":
      return "Retired";
  }
}
