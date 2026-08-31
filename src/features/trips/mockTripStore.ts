import type { MockDriverStore } from "../drivers";
import type { MockFleetStore } from "../fleet";
import type {
  CompleteTripInput,
  DraftTripInput,
  EligibleResources,
  ISODateTimeString,
  MockTripSeed,
  TripOperationError,
  TripRecord,
  TripResult,
} from "./types";
import { getDriverDispatchBlockers, getVehicleDispatchBlockers } from "./eligibility";

const DEFAULT_MOCK_NOW = "2026-08-31T00:00:00.000Z";

export function buildMockTrip(seed: MockTripSeed, index = 0): TripRecord {
  const createdAt = seed.createdAt ?? DEFAULT_MOCK_NOW;
  const updatedAt = seed.updatedAt ?? createdAt;

  return {
    id: seed.id ?? `trip-${index + 1}`,
    source: seed.source.trim(),
    destination: seed.destination.trim(),
    vehicleId: seed.vehicleId,
    driverId: seed.driverId,
    cargoWeightKg: seed.cargoWeightKg,
    plannedDistanceKm: seed.plannedDistanceKm ?? 1,
    revenue: seed.revenue ?? 0,
    status: seed.status ?? "draft",
    startOdometerKm: seed.startOdometerKm ?? null,
    finalOdometerKm: seed.finalOdometerKm ?? null,
    actualDistanceKm: seed.actualDistanceKm ?? null,
    completionFuelDraft: seed.completionFuelDraft ?? null,
    dispatchedAt: seed.dispatchedAt ?? null,
    completedAt: seed.completedAt ?? null,
    cancelledAt: seed.cancelledAt ?? null,
    createdAt,
    updatedAt,
    createdBy: seed.createdBy ?? null,
  };
}

function cloneTrip(trip: TripRecord): TripRecord {
  return {
    ...trip,
    completionFuelDraft: trip.completionFuelDraft ? { ...trip.completionFuelDraft } : null,
  };
}

function tripError(error: TripOperationError): TripResult<never> {
  return { ok: false, error };
}

function invalidTripField(field: keyof DraftTripInput, message: string): TripResult<never> {
  return tripError({
    code: "INVALID_TRIP_FIELD",
    field,
    message,
    recovery: "Correct the trip field and try again.",
  });
}

function validateDraftTripInput(input: DraftTripInput): TripResult<undefined> {
  if (input.source.trim().length === 0) {
    return invalidTripField("source", "Source is required.");
  }

  if (input.destination.trim().length === 0) {
    return invalidTripField("destination", "Destination is required.");
  }

  if (input.vehicleId.trim().length === 0) {
    return invalidTripField("vehicleId", "Vehicle is required.");
  }

  if (input.driverId.trim().length === 0) {
    return invalidTripField("driverId", "Driver is required.");
  }

  if (input.cargoWeightKg <= 0) {
    return invalidTripField("cargoWeightKg", "Cargo weight must be greater than 0 kg.");
  }

  if (input.plannedDistanceKm <= 0) {
    return invalidTripField("plannedDistanceKm", "Planned distance must be greater than 0 km.");
  }

  if (input.revenue < 0) {
    return invalidTripField("revenue", "Revenue cannot be negative.");
  }

  return { ok: true, data: undefined };
}

function validateCompletionFuel(input: CompleteTripInput): TripResult<undefined> {
  if (input.finalOdometerKm < 0) {
    return tripError({
      code: "FINAL_ODOMETER_TOO_LOW",
      field: "finalOdometerKm",
      message: "Final odometer cannot be negative.",
      recovery: "Enter an odometer reading at or above the current vehicle reading.",
    });
  }

  if (input.fuel === undefined) {
    return { ok: true, data: undefined };
  }

  if (input.fuel.liters <= 0) {
    return tripError({
      code: "INVALID_FUEL_FIELD",
      field: "fuelLiters",
      message: "Fuel litres must be greater than 0.",
      recovery: "Enter the fuel consumed for the completed trip or omit fuel for now.",
    });
  }

  if (input.fuel.cost < 0) {
    return tripError({
      code: "INVALID_FUEL_FIELD",
      field: "fuelCost",
      message: "Fuel cost cannot be negative.",
      recovery: "Enter a nonnegative fuel cost.",
    });
  }

  return { ok: true, data: undefined };
}

export class MockTripStore {
  private readonly trips = new Map<string, TripRecord>();
  private readonly fleetStore: MockFleetStore;
  private readonly driverStore: MockDriverStore;
  private readonly now: () => ISODateTimeString;
  private nextId: number;

  constructor(
    dependencies: { fleetStore: MockFleetStore; driverStore: MockDriverStore },
    seeds: MockTripSeed[] = [],
    options: { now?: () => ISODateTimeString } = {},
  ) {
    this.fleetStore = dependencies.fleetStore;
    this.driverStore = dependencies.driverStore;
    this.now = options.now ?? (() => new Date().toISOString());
    seeds.forEach((seed, index) => {
      const trip = buildMockTrip(seed, index);
      this.trips.set(trip.id, trip);
    });
    this.nextId = seeds.length + 1;
  }

  listTrips(): TripRecord[] {
    return [...this.trips.values()]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(cloneTrip);
  }

  getTrip(tripId: string): TripRecord | undefined {
    const trip = this.trips.get(tripId);
    return trip ? cloneTrip(trip) : undefined;
  }

  listEligibleResources(input: { cargoWeightKg?: number; dispatchDate: string }): EligibleResources {
    const vehicles = this.fleetStore.listVehicles({ includeArchived: true });
    const drivers = this.driverStore.listDrivers({ includeArchived: true });

    const eligibleVehicles = vehicles.filter(
      (vehicle) => getVehicleDispatchBlockers(vehicle, input.cargoWeightKg).length === 0,
    );
    const blockedVehicles = vehicles.flatMap((vehicle) =>
      getVehicleDispatchBlockers(vehicle, input.cargoWeightKg),
    );
    const eligibleDrivers = drivers.filter(
      (driver) => getDriverDispatchBlockers(driver, input.dispatchDate).length === 0,
    );
    const blockedDrivers = drivers.flatMap((driver) =>
      getDriverDispatchBlockers(driver, input.dispatchDate),
    );

    return { eligibleVehicles, blockedVehicles, eligibleDrivers, blockedDrivers };
  }

  createDraftTrip(input: DraftTripInput, createdBy: string | null = null): TripResult<TripRecord> {
    const validation = validateDraftTripInput(input);
    if (!validation.ok) return validation;

    if (!this.fleetStore.getVehicle(input.vehicleId)) {
      return tripError({
        code: "VEHICLE_NOT_FOUND",
        field: "vehicleId",
        message: "Selected vehicle was not found.",
        recovery: "Refresh eligible vehicles and choose again.",
      });
    }

    if (!this.driverStore.getDriver(input.driverId)) {
      return tripError({
        code: "DRIVER_NOT_FOUND",
        field: "driverId",
        message: "Selected driver was not found.",
        recovery: "Refresh eligible drivers and choose again.",
      });
    }

    const now = this.now();
    const trip: TripRecord = {
      ...input,
      source: input.source.trim(),
      destination: input.destination.trim(),
      id: `trip-${this.nextId++}`,
      status: "draft",
      startOdometerKm: null,
      finalOdometerKm: null,
      actualDistanceKm: null,
      completionFuelDraft: null,
      dispatchedAt: null,
      completedAt: null,
      cancelledAt: null,
      createdAt: now,
      updatedAt: now,
      createdBy,
    };

    this.trips.set(trip.id, trip);
    return { ok: true, data: cloneTrip(trip) };
  }

  dispatchTrip(tripId: string, options: { dispatchDate: string } = { dispatchDate: "2026-08-31" }): TripResult<TripRecord> {
    const trip = this.trips.get(tripId);
    if (!trip) {
      return tripError({
        code: "TRIP_NOT_FOUND",
        message: "Trip was not found.",
        recovery: "Refresh the trip list and choose a draft trip.",
      });
    }

    if (trip.status !== "draft") {
      return tripError({
        code: "INVALID_TRIP_TRANSITION",
        message: "Only Draft trips can be dispatched.",
        recovery: "Refresh the trip and choose an allowed action.",
      });
    }

    const blockers = this.getDispatchBlockers(trip, options.dispatchDate);
    if (blockers.length > 0) {
      return tripError({
        code: blockers[0].code,
        message: blockers[0].message,
        recovery: blockers[0].recovery,
        blockers,
      });
    }

    const vehicle = this.fleetStore.getVehicle(trip.vehicleId);
    if (!vehicle) {
      return tripError({
        code: "VEHICLE_NOT_FOUND",
        field: "vehicleId",
        message: "Selected vehicle was not found.",
        recovery: "Refresh eligible vehicles and choose again.",
      });
    }

    const reservedVehicle = this.fleetStore.reserveVehicleForTrip(trip.vehicleId);
    if (!reservedVehicle.ok) {
      return tripError({
        code: "RESOURCE_ALREADY_ASSIGNED",
        message: reservedVehicle.error.message,
        recovery: reservedVehicle.error.recovery,
      });
    }

    const reservedDriver = this.driverStore.reserveDriverForTrip(trip.driverId);
    if (!reservedDriver.ok) {
      this.fleetStore.releaseVehicleFromTrip(trip.vehicleId);
      return tripError({
        code: "RESOURCE_ALREADY_ASSIGNED",
        message: reservedDriver.error.message,
        recovery: reservedDriver.error.recovery,
      });
    }

    const updated: TripRecord = {
      ...trip,
      status: "dispatched",
      startOdometerKm: vehicle.odometerKm,
      dispatchedAt: this.now(),
      updatedAt: this.now(),
    };
    this.trips.set(tripId, updated);

    return { ok: true, data: cloneTrip(updated) };
  }

  completeTrip(tripId: string, input: CompleteTripInput): TripResult<TripRecord> {
    const validation = validateCompletionFuel(input);
    if (!validation.ok) return validation;

    const trip = this.trips.get(tripId);
    if (!trip) {
      return tripError({
        code: "TRIP_NOT_FOUND",
        message: "Trip was not found.",
        recovery: "Refresh the trip list and choose a dispatched trip.",
      });
    }

    if (trip.status !== "dispatched") {
      return tripError({
        code: "INVALID_TRIP_TRANSITION",
        message: "Only Dispatched trips can be completed.",
        recovery: "Refresh the trip and choose an allowed action.",
      });
    }

    const vehicle = this.fleetStore.getVehicle(trip.vehicleId);
    const driver = this.driverStore.getDriver(trip.driverId);
    if (!vehicle || !driver) {
      return tripError({
        code: !vehicle ? "VEHICLE_NOT_FOUND" : "DRIVER_NOT_FOUND",
        message: "Assigned trip resource was not found.",
        recovery: "Refresh the trip before retrying completion.",
      });
    }

    const startOdometerKm = trip.startOdometerKm ?? vehicle.odometerKm;
    const lowestAllowedOdometer = Math.max(startOdometerKm, vehicle.odometerKm);
    if (input.finalOdometerKm < lowestAllowedOdometer) {
      return tripError({
        code: "FINAL_ODOMETER_TOO_LOW",
        field: "finalOdometerKm",
        message: `Final odometer must be at least ${lowestAllowedOdometer} km.`,
        recovery: "Enter a final reading that does not decrease the vehicle odometer.",
      });
    }

    const releasedVehicle = this.fleetStore.releaseVehicleFromTrip(trip.vehicleId);
    if (!releasedVehicle.ok) {
      return tripError({
        code: "RESOURCE_ALREADY_ASSIGNED",
        message: releasedVehicle.error.message,
        recovery: releasedVehicle.error.recovery,
      });
    }

    const releasedDriver = this.driverStore.releaseDriverFromTrip(trip.driverId);
    if (!releasedDriver.ok) {
      this.fleetStore.reserveVehicleForTrip(trip.vehicleId);
      return tripError({
        code: "RESOURCE_ALREADY_ASSIGNED",
        message: releasedDriver.error.message,
        recovery: releasedDriver.error.recovery,
      });
    }

    const updatedVehicle = this.fleetStore.updateVehicle(trip.vehicleId, {
      odometerKm: input.finalOdometerKm,
    });
    if (!updatedVehicle.ok) {
      this.fleetStore.reserveVehicleForTrip(trip.vehicleId);
      this.driverStore.reserveDriverForTrip(trip.driverId);
      return tripError({
        code: "FINAL_ODOMETER_TOO_LOW",
        message: updatedVehicle.error.message,
        recovery: updatedVehicle.error.recovery,
      });
    }

    const updated: TripRecord = {
      ...trip,
      status: "completed",
      finalOdometerKm: input.finalOdometerKm,
      actualDistanceKm: input.finalOdometerKm - startOdometerKm,
      completionFuelDraft: input.fuel ? { ...input.fuel } : null,
      completedAt: this.now(),
      updatedAt: this.now(),
    };
    this.trips.set(tripId, updated);

    return { ok: true, data: cloneTrip(updated) };
  }

  cancelTrip(tripId: string): TripResult<TripRecord> {
    const trip = this.trips.get(tripId);
    if (!trip) {
      return tripError({
        code: "TRIP_NOT_FOUND",
        message: "Trip was not found.",
        recovery: "Refresh the trip list before retrying cancellation.",
      });
    }

    if (trip.status === "completed" || trip.status === "cancelled") {
      return tripError({
        code: "INVALID_TRIP_TRANSITION",
        message: "Terminal trips cannot transition again.",
        recovery: "Create a new draft trip for additional work.",
      });
    }

    if (trip.status === "dispatched") {
      const releasedVehicle = this.fleetStore.releaseVehicleFromTrip(trip.vehicleId);
      if (!releasedVehicle.ok) {
        return tripError({
          code: "RESOURCE_ALREADY_ASSIGNED",
          message: releasedVehicle.error.message,
          recovery: releasedVehicle.error.recovery,
        });
      }

      const releasedDriver = this.driverStore.releaseDriverFromTrip(trip.driverId);
      if (!releasedDriver.ok) {
        this.fleetStore.reserveVehicleForTrip(trip.vehicleId);
        return tripError({
          code: "RESOURCE_ALREADY_ASSIGNED",
          message: releasedDriver.error.message,
          recovery: releasedDriver.error.recovery,
        });
      }
    }

    const updated: TripRecord = {
      ...trip,
      status: "cancelled",
      cancelledAt: this.now(),
      updatedAt: this.now(),
    };
    this.trips.set(tripId, updated);
    return { ok: true, data: cloneTrip(updated) };
  }

  private getDispatchBlockers(trip: TripRecord, dispatchDate: string) {
    const vehicle = this.fleetStore.getVehicle(trip.vehicleId);
    const driver = this.driverStore.getDriver(trip.driverId);
    const blockers = [];

    if (!vehicle) {
      blockers.push({
        resourceKind: "vehicle" as const,
        resourceId: trip.vehicleId,
        code: "VEHICLE_NOT_FOUND" as const,
        message: "Selected vehicle was not found.",
        recovery: "Refresh eligible vehicles and choose again.",
      });
    } else {
      blockers.push(...getVehicleDispatchBlockers(vehicle, trip.cargoWeightKg));
    }

    if (!driver) {
      blockers.push({
        resourceKind: "driver" as const,
        resourceId: trip.driverId,
        code: "DRIVER_NOT_FOUND" as const,
        message: "Selected driver was not found.",
        recovery: "Refresh eligible drivers and choose again.",
      });
    } else {
      blockers.push(...getDriverDispatchBlockers(driver, dispatchDate));
    }

    const conflictingTrip = [...this.trips.values()].find(
      (candidate) =>
        candidate.id !== trip.id &&
        candidate.status === "dispatched" &&
        (candidate.vehicleId === trip.vehicleId || candidate.driverId === trip.driverId),
    );

    if (conflictingTrip) {
      blockers.push({
        resourceKind: "trip" as const,
        resourceId: conflictingTrip.id,
        code: "RESOURCE_ALREADY_ASSIGNED" as const,
        message: "The selected vehicle or driver is already assigned to a dispatched trip.",
        recovery: "Complete or cancel the active trip, then retry dispatch.",
      });
    }

    return blockers;
  }
}
