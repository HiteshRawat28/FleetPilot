import { MockDriverStore } from "../../../src/features/drivers";
import { MockFleetStore } from "../../../src/features/fleet";
import { MockMaintenanceStore } from "../../../src/features/maintenance";
import { MockTripStore } from "../../../src/features/trips";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function assertFailureCode<T>(
  result: { ok: true; data: T } | { ok: false; error: { code: string } },
  code: string,
  message: string,
): void {
  assert(!result.ok, message);
  assertEqual(result.error.code, code, message);
}

function createStores() {
  const fleetStore = new MockFleetStore(
    [
      {
        id: "vehicle-van-05",
        registrationNumber: "Van-05",
        nameModel: "Van-05",
        type: "van",
        maxLoadKg: 500,
        odometerKm: 1000,
        acquisitionCost: 20000,
        region: "West",
      },
      {
        id: "vehicle-shop",
        registrationNumber: "Shop-01",
        status: "in_shop",
      },
      {
        id: "vehicle-retired",
        registrationNumber: "Ret-01",
        status: "retired",
      },
      {
        id: "vehicle-heavy",
        registrationNumber: "Heavy-01",
        type: "box_truck",
        maxLoadKg: 1200,
      },
    ],
    { now: () => "2026-08-31T10:00:00.000Z" },
  );

  const driverStore = new MockDriverStore(
    [
      {
        id: "driver-alex",
        name: "Alex",
        licenseNumber: "A-100",
        licenseExpiryDate: "2026-08-31",
      },
      {
        id: "driver-expired",
        name: "Expired Driver",
        licenseExpiryDate: "2026-08-30",
      },
      {
        id: "driver-suspended",
        name: "Suspended Driver",
        status: "suspended",
      },
      {
        id: "driver-off-duty",
        name: "Off Duty Driver",
        status: "off_duty",
      },
    ],
    { now: () => "2026-08-31T10:00:00.000Z" },
  );

  const tripStore = new MockTripStore(
    { fleetStore, driverStore },
    [],
    { now: () => "2026-08-31T10:00:00.000Z" },
  );

  const maintenanceStore = new MockMaintenanceStore(
    { fleetStore },
    [],
    { now: () => "2026-08-31T10:00:00.000Z" },
  );

  return { fleetStore, driverStore, tripStore, maintenanceStore };
}

function testNormalizedVehicleRegistrationUniqueness(): void {
  const { fleetStore } = createStores();

  const result = fleetStore.createVehicle({
    registrationNumber: "  van-05  ",
    nameModel: "Duplicate Van",
    type: "van",
    maxLoadKg: 500,
    odometerKm: 0,
    acquisitionCost: 10000,
    region: "West",
  });

  assertFailureCode(result, "DUPLICATE_REGISTRATION", "trimmed case-normalized registrations are unique");
}

function testEligibilityExplainsVehicleAndDriverBlockers(): void {
  const { tripStore } = createStores();

  const resources = tripStore.listEligibleResources({
    cargoWeightKg: 550,
    dispatchDate: "2026-08-31",
  });

  assert(
    resources.blockedVehicles.some((blocker) => blocker.code === "CARGO_EXCEEDS_CAPACITY"),
    "capacity blocker is exposed for overloaded vehicles",
  );
  assert(
    resources.blockedVehicles.some((blocker) => blocker.code === "VEHICLE_IN_MAINTENANCE"),
    "maintenance blocker is exposed for In Shop vehicles",
  );
  assert(
    resources.blockedVehicles.some((blocker) => blocker.code === "VEHICLE_RETIRED"),
    "retirement blocker is exposed for Retired vehicles",
  );
  assert(
    resources.blockedDrivers.some((blocker) => blocker.code === "DRIVER_LICENSE_EXPIRED"),
    "expired licence blocker is exposed for drivers",
  );
  assert(
    resources.blockedDrivers.some((blocker) => blocker.code === "DRIVER_SUSPENDED"),
    "suspension blocker is exposed for drivers",
  );
  assert(
    resources.blockedDrivers.some((blocker) => blocker.code === "DRIVER_OFF_DUTY"),
    "off-duty blocker is exposed for drivers",
  );
  assert(
    resources.eligibleDrivers.some((driver) => driver.id === "driver-alex"),
    "licence expiry equal to dispatch date remains eligible",
  );
}

function testDispatchCompletesMandatoryWorkflowStep(): void {
  const { fleetStore, driverStore, tripStore } = createStores();

  const draft = tripStore.createDraftTrip({
    source: "Depot",
    destination: "Retail Hub",
    vehicleId: "vehicle-van-05",
    driverId: "driver-alex",
    cargoWeightKg: 450,
    plannedDistanceKm: 80,
    revenue: 1500,
  });
  assert(draft.ok, "valid draft trip is created");

  const dispatched = tripStore.dispatchTrip(draft.data.id, { dispatchDate: "2026-08-31" });
  assert(dispatched.ok, "valid 450 kg cargo dispatches into 500 kg vehicle");
  assertEqual(dispatched.data.status, "dispatched", "trip is marked dispatched");
  assertEqual(dispatched.data.startOdometerKm, 1000, "start odometer is captured at dispatch");
  assertEqual(fleetStore.getVehicle("vehicle-van-05")?.status, "on_trip", "vehicle is On Trip");
  assertEqual(driverStore.getDriver("driver-alex")?.status, "on_trip", "driver is On Trip");
}

function testFailedDispatchLeavesNoPartialState(): void {
  const { fleetStore, driverStore, tripStore } = createStores();

  const draft = tripStore.createDraftTrip({
    source: "Depot",
    destination: "Retail Hub",
    vehicleId: "vehicle-van-05",
    driverId: "driver-expired",
    cargoWeightKg: 450,
    plannedDistanceKm: 80,
    revenue: 1500,
  });
  assert(draft.ok, "draft with stale resource is allowed before dispatch");

  const failed = tripStore.dispatchTrip(draft.data.id, { dispatchDate: "2026-08-31" });
  assertFailureCode(failed, "DRIVER_LICENSE_EXPIRED", "expired driver blocks dispatch");
  assertEqual(tripStore.getTrip(draft.data.id)?.status, "draft", "failed dispatch keeps trip Draft");
  assertEqual(fleetStore.getVehicle("vehicle-van-05")?.status, "available", "failed dispatch keeps vehicle Available");
  assertEqual(driverStore.getDriver("driver-expired")?.status, "available", "failed dispatch keeps driver Available");
}

function testCompletionRejectsDecreasingOdometerThenReleasesResources(): void {
  const { fleetStore, driverStore, tripStore } = createStores();

  const draft = tripStore.createDraftTrip({
    source: "Depot",
    destination: "Retail Hub",
    vehicleId: "vehicle-van-05",
    driverId: "driver-alex",
    cargoWeightKg: 450,
    plannedDistanceKm: 80,
    revenue: 1500,
  });
  assert(draft.ok, "draft is created");

  const dispatched = tripStore.dispatchTrip(draft.data.id, { dispatchDate: "2026-08-31" });
  assert(dispatched.ok, "draft dispatches");

  const tooLow = tripStore.completeTrip(draft.data.id, { finalOdometerKm: 999 });
  assertFailureCode(tooLow, "FINAL_ODOMETER_TOO_LOW", "decreasing odometer is rejected");
  assertEqual(tripStore.getTrip(draft.data.id)?.status, "dispatched", "failed completion keeps trip Dispatched");
  assertEqual(fleetStore.getVehicle("vehicle-van-05")?.status, "on_trip", "failed completion keeps vehicle On Trip");
  assertEqual(driverStore.getDriver("driver-alex")?.status, "on_trip", "failed completion keeps driver On Trip");

  const completed = tripStore.completeTrip(draft.data.id, {
    finalOdometerKm: 1080,
    fuel: { liters: 10, cost: 120, loggedDate: "2026-08-31" },
  });
  assert(completed.ok, "completion succeeds with valid final odometer and fuel draft");
  assertEqual(completed.data.status, "completed", "trip becomes Completed");
  assertEqual(completed.data.actualDistanceKm, 80, "actual distance is final minus start odometer");
  assertEqual(completed.data.completionFuelDraft?.liters, 10, "optional fuel draft is retained for finance integration");
  assertEqual(fleetStore.getVehicle("vehicle-van-05")?.status, "available", "vehicle is released");
  assertEqual(fleetStore.getVehicle("vehicle-van-05")?.odometerKm, 1080, "vehicle odometer is updated");
  assertEqual(driverStore.getDriver("driver-alex")?.status, "available", "driver is released");
}

function testCancelReleasesOnlyDispatchedResources(): void {
  const { fleetStore, driverStore, tripStore } = createStores();

  const draft = tripStore.createDraftTrip({
    source: "Depot",
    destination: "Retail Hub",
    vehicleId: "vehicle-van-05",
    driverId: "driver-alex",
    cargoWeightKg: 450,
    plannedDistanceKm: 80,
    revenue: 1500,
  });
  assert(draft.ok, "draft is created");

  const dispatched = tripStore.dispatchTrip(draft.data.id, { dispatchDate: "2026-08-31" });
  assert(dispatched.ok, "draft dispatches");

  const cancelled = tripStore.cancelTrip(draft.data.id);
  assert(cancelled.ok, "dispatched trip cancels");
  assertEqual(cancelled.data.status, "cancelled", "trip is Cancelled");
  assertEqual(fleetStore.getVehicle("vehicle-van-05")?.status, "available", "cancel releases vehicle");
  assertEqual(driverStore.getDriver("driver-alex")?.status, "available", "cancel releases driver");

  const terminalRetry = tripStore.cancelTrip(draft.data.id);
  assertFailureCode(terminalRetry, "INVALID_TRIP_TRANSITION", "terminal trip cannot transition again");
}

function testMaintenanceOpenCloseAndDuplicateRules(): void {
  const { fleetStore, maintenanceStore } = createStores();

  const opened = maintenanceStore.openMaintenance({
    vehicleId: "vehicle-van-05",
    maintenanceType: "preventive",
    description: "Oil change",
  });
  assert(opened.ok, "maintenance opens on an available vehicle");
  assertEqual(fleetStore.getVehicle("vehicle-van-05")?.status, "in_shop", "opening maintenance sends vehicle In Shop");

  const duplicate = maintenanceStore.openMaintenance({
    vehicleId: "vehicle-van-05",
    maintenanceType: "repair",
    description: "Second log",
  });
  assertFailureCode(duplicate, "ACTIVE_MAINTENANCE_EXISTS", "duplicate active maintenance is rejected");

  const closed = maintenanceStore.closeMaintenance(opened.data.id, {
    cost: {
      amount: 250,
      expenseDate: "2026-08-31",
      description: "Oil and filter",
    },
  });
  assert(closed.ok, "active maintenance closes");
  assertEqual(closed.data.status, "closed", "maintenance log is Closed");
  assertEqual(closed.data.maintenanceCostDraft?.amount, 250, "one maintenance cost draft is attached");
  assertEqual(fleetStore.getVehicle("vehicle-van-05")?.status, "available", "closing maintenance restores Available");
}

function testMaintenanceCloseKeepsRetiredVehicleRetired(): void {
  const { fleetStore, maintenanceStore } = createStores();

  const opened = maintenanceStore.openMaintenance({
    vehicleId: "vehicle-van-05",
    maintenanceType: "inspection",
    description: "Retirement inspection",
  });
  assert(opened.ok, "maintenance opens");

  const retired = fleetStore.retireVehicle("vehicle-van-05");
  assert(retired.ok, "vehicle can be retired while not on trip");

  const closed = maintenanceStore.closeMaintenance(opened.data.id);
  assert(closed.ok, "maintenance can close after vehicle retirement");
  assertEqual(fleetStore.getVehicle("vehicle-van-05")?.status, "retired", "closed retired vehicle stays Retired");
}

const tests: Array<[string, () => void]> = [
  ["normalized vehicle registration uniqueness", testNormalizedVehicleRegistrationUniqueness],
  ["eligibility explains vehicle and driver blockers", testEligibilityExplainsVehicleAndDriverBlockers],
  ["dispatch completes mandatory workflow step", testDispatchCompletesMandatoryWorkflowStep],
  ["failed dispatch leaves no partial state", testFailedDispatchLeavesNoPartialState],
  ["completion rejects decreasing odometer then releases resources", testCompletionRejectsDecreasingOdometerThenReleasesResources],
  ["cancel releases only dispatched resources", testCancelReleasesOnlyDispatchedResources],
  ["maintenance open, close, and duplicate rules", testMaintenanceOpenCloseAndDuplicateRules],
  ["maintenance close keeps retired vehicle retired", testMaintenanceCloseKeepsRetiredVehicleRetired],
];

for (const [name, test] of tests) {
  test();
  console.log(`PASS ${name}`);
}
