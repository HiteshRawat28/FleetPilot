import type {
  CreateDriverInput,
  DriverDomainError,
  DriverFilters,
  DriverRecord,
  DriverResult,
  DriverStatus,
  ISODateString,
  ISODateTimeString,
  MockDriverSeed,
  UpdateDriverInput,
} from "./types";

const DEFAULT_MOCK_NOW = "2026-08-31T00:00:00.000Z";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeLicenseNumber(licenseNumber: string): string {
  return licenseNumber.trim().toUpperCase();
}

export function isLicenseValidForDispatch(
  driver: Pick<DriverRecord, "licenseExpiryDate">,
  dispatchDate: ISODateString,
): boolean {
  return driver.licenseExpiryDate >= dispatchDate;
}

export function buildMockDriver(seed: MockDriverSeed, index = 0): DriverRecord {
  const createdAt = seed.createdAt ?? DEFAULT_MOCK_NOW;
  const updatedAt = seed.updatedAt ?? createdAt;

  return {
    id: seed.id ?? `driver-${index + 1}`,
    name: seed.name.trim(),
    licenseNumber: normalizeLicenseNumber(seed.licenseNumber ?? `LIC-${index + 1}`),
    licenseCategory: (seed.licenseCategory ?? "LMV").trim(),
    licenseExpiryDate: seed.licenseExpiryDate ?? "2027-08-31",
    contactNumber: (seed.contactNumber ?? "0000000000").trim(),
    safetyScore: seed.safetyScore ?? 90,
    status: seed.status ?? "available",
    archivedAt: seed.archivedAt ?? null,
    createdAt,
    updatedAt,
    createdBy: seed.createdBy ?? null,
  };
}

function cloneDriver(driver: DriverRecord): DriverRecord {
  return { ...driver };
}

function driverError(error: DriverDomainError): DriverResult<never> {
  return { ok: false, error };
}

function invalidField(
  field: keyof CreateDriverInput,
  message: string,
  recovery = "Correct the driver field and try again.",
): DriverResult<never> {
  return driverError({
    code: "INVALID_DRIVER_FIELD",
    field,
    message,
    recovery,
  });
}

function validateRequiredText(
  field: "name" | "licenseNumber" | "licenseCategory" | "contactNumber",
  value: string | undefined,
): DriverResult<undefined> {
  if (value === undefined) {
    return { ok: true, data: undefined };
  }

  if (value.trim().length === 0) {
    return invalidField(field, `${field} is required.`);
  }

  return { ok: true, data: undefined };
}

function validateDriverInput(input: UpdateDriverInput): DriverResult<undefined> {
  const name = validateRequiredText("name", input.name);
  if (!name.ok) return name;

  const licenseNumber = validateRequiredText("licenseNumber", input.licenseNumber);
  if (!licenseNumber.ok) return licenseNumber;

  const licenseCategory = validateRequiredText("licenseCategory", input.licenseCategory);
  if (!licenseCategory.ok) return licenseCategory;

  const contactNumber = validateRequiredText("contactNumber", input.contactNumber);
  if (!contactNumber.ok) return contactNumber;

  if (input.licenseExpiryDate !== undefined && !ISO_DATE_PATTERN.test(input.licenseExpiryDate)) {
    return invalidField(
      "licenseExpiryDate",
      "Licence expiry date must use YYYY-MM-DD.",
      "Use a business date such as 2026-08-31.",
    );
  }

  if (
    input.safetyScore !== undefined &&
    (!Number.isFinite(input.safetyScore) || input.safetyScore < 0 || input.safetyScore > 100)
  ) {
    return invalidField("safetyScore", "Safety score must be between 0 and 100.");
  }

  return { ok: true, data: undefined };
}

export class MockDriverStore {
  private readonly drivers = new Map<string, DriverRecord>();
  private readonly now: () => ISODateTimeString;
  private nextId: number;

  constructor(
    seeds: MockDriverSeed[] = [],
    options: { now?: () => ISODateTimeString } = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    seeds.forEach((seed, index) => {
      const driver = buildMockDriver(seed, index);
      this.drivers.set(driver.id, driver);
    });
    this.nextId = seeds.length + 1;
  }

  listDrivers(filters: DriverFilters = {}): DriverRecord[] {
    const query = filters.query?.trim().toLowerCase();

    return [...this.drivers.values()]
      .filter((driver) => filters.includeArchived || driver.archivedAt === null)
      .filter((driver) => filters.status === undefined || driver.status === filters.status)
      .filter(
        (driver) =>
          filters.licenseCategory === undefined || driver.licenseCategory === filters.licenseCategory,
      )
      .filter((driver) => {
        if (!query) return true;
        return (
          driver.name.toLowerCase().includes(query) ||
          driver.licenseNumber.toLowerCase().includes(query) ||
          driver.licenseCategory.toLowerCase().includes(query)
        );
      })
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(cloneDriver);
  }

  getDriver(driverId: string): DriverRecord | undefined {
    const driver = this.drivers.get(driverId);
    return driver ? cloneDriver(driver) : undefined;
  }

  createDriver(input: CreateDriverInput, createdBy: string | null = null): DriverResult<DriverRecord> {
    const validation = validateDriverInput(input);
    if (!validation.ok) return validation;

    const licenseNumber = normalizeLicenseNumber(input.licenseNumber);
    if (this.hasLicense(licenseNumber)) {
      return driverError({
        code: "DUPLICATE_LICENSE",
        field: "licenseNumber",
        message: `Driver licence ${input.licenseNumber.trim()} is already in use.`,
        recovery: "Use a unique licence number before saving.",
      });
    }

    const now = this.now();
    const driver: DriverRecord = {
      id: `driver-${this.nextId++}`,
      name: input.name.trim(),
      licenseNumber,
      licenseCategory: input.licenseCategory.trim(),
      licenseExpiryDate: input.licenseExpiryDate,
      contactNumber: input.contactNumber.trim(),
      safetyScore: input.safetyScore,
      status: "available",
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      createdBy,
    };

    this.drivers.set(driver.id, driver);
    return { ok: true, data: cloneDriver(driver) };
  }

  updateDriver(driverId: string, input: UpdateDriverInput): DriverResult<DriverRecord> {
    const driver = this.drivers.get(driverId);
    if (!driver) {
      return driverError({
        code: "DRIVER_NOT_FOUND",
        message: "Driver was not found.",
        recovery: "Refresh the driver list and choose an active driver.",
      });
    }

    if (driver.archivedAt !== null) {
      return driverError({
        code: "DRIVER_ARCHIVED",
        message: `${driver.name} is archived and cannot be edited.`,
        recovery: "Restore or create a new driver record before making changes.",
      });
    }

    const validation = validateDriverInput(input);
    if (!validation.ok) return validation;

    const nextLicenseNumber = normalizeLicenseNumber(input.licenseNumber ?? driver.licenseNumber);
    if (this.hasLicense(nextLicenseNumber, driverId)) {
      return driverError({
        code: "DUPLICATE_LICENSE",
        field: "licenseNumber",
        message: `Driver licence ${input.licenseNumber?.trim() ?? driver.licenseNumber} is already in use.`,
        recovery: "Use a unique licence number before saving.",
      });
    }

    const updated: DriverRecord = {
      ...driver,
      name: input.name?.trim() ?? driver.name,
      licenseNumber: nextLicenseNumber,
      licenseCategory: input.licenseCategory?.trim() ?? driver.licenseCategory,
      licenseExpiryDate: input.licenseExpiryDate ?? driver.licenseExpiryDate,
      contactNumber: input.contactNumber?.trim() ?? driver.contactNumber,
      safetyScore: input.safetyScore ?? driver.safetyScore,
      updatedAt: this.now(),
    };

    this.drivers.set(driverId, updated);
    return { ok: true, data: cloneDriver(updated) };
  }

  archiveDriver(driverId: string): DriverResult<DriverRecord> {
    const driver = this.drivers.get(driverId);
    if (!driver) {
      return driverError({
        code: "DRIVER_NOT_FOUND",
        message: "Driver was not found.",
        recovery: "Refresh the driver list and choose an active driver.",
      });
    }

    if (driver.status === "on_trip") {
      return driverError({
        code: "DRIVER_ACTIVE_OPERATION",
        message: `${driver.name} is On Trip and cannot be archived.`,
        recovery: "Complete or cancel the active trip before archiving.",
      });
    }

    const updated = { ...driver, archivedAt: this.now(), updatedAt: this.now() };
    this.drivers.set(driverId, updated);
    return { ok: true, data: cloneDriver(updated) };
  }

  reserveDriverForTrip(driverId: string): DriverResult<DriverRecord> {
    return this.transitionDriverStatus(driverId, "available", "on_trip", {
      code: "INVALID_DRIVER_STATUS",
      message: "Driver must be Available before dispatch.",
      recovery: "Choose a driver who is Available and compliant.",
    });
  }

  releaseDriverFromTrip(driverId: string): DriverResult<DriverRecord> {
    return this.transitionDriverStatus(driverId, "on_trip", "available", {
      code: "INVALID_DRIVER_STATUS",
      message: "Driver is not currently On Trip.",
      recovery: "Refresh the trip and driver status before retrying.",
    });
  }

  suspendDriver(driverId: string): DriverResult<DriverRecord> {
    return this.setDriverStatusOutsideTrip(driverId, "suspended");
  }

  markDriverOffDuty(driverId: string): DriverResult<DriverRecord> {
    return this.setDriverStatusOutsideTrip(driverId, "off_duty");
  }

  restoreDriverAvailability(driverId: string): DriverResult<DriverRecord> {
    const driver = this.drivers.get(driverId);
    if (!driver) {
      return driverError({
        code: "DRIVER_NOT_FOUND",
        message: "Driver was not found.",
        recovery: "Refresh the driver list and choose an active driver.",
      });
    }

    if (driver.archivedAt !== null) {
      return driverError({
        code: "DRIVER_ARCHIVED",
        message: `${driver.name} is archived.`,
        recovery: "Choose an active driver.",
      });
    }

    if (driver.status === "on_trip") {
      return driverError({
        code: "DRIVER_ACTIVE_OPERATION",
        message: `${driver.name} is On Trip and cannot be restored directly.`,
        recovery: "Complete or cancel the active trip to release this driver.",
      });
    }

    const updated = { ...driver, status: "available" as const, updatedAt: this.now() };
    this.drivers.set(driverId, updated);
    return { ok: true, data: cloneDriver(updated) };
  }

  private hasLicense(licenseNumber: string, exceptDriverId?: string): boolean {
    return [...this.drivers.values()].some(
      (driver) => driver.id !== exceptDriverId && driver.licenseNumber === licenseNumber,
    );
  }

  private transitionDriverStatus(
    driverId: string,
    expectedStatus: DriverStatus,
    nextStatus: DriverStatus,
    invalidStatusError: DriverDomainError,
  ): DriverResult<DriverRecord> {
    const driver = this.drivers.get(driverId);
    if (!driver) {
      return driverError({
        code: "DRIVER_NOT_FOUND",
        message: "Driver was not found.",
        recovery: "Refresh the driver list and choose an active driver.",
      });
    }

    if (driver.archivedAt !== null) {
      return driverError({
        code: "DRIVER_ARCHIVED",
        message: `${driver.name} is archived.`,
        recovery: "Choose an active driver.",
      });
    }

    if (driver.status !== expectedStatus) {
      return driverError(invalidStatusError);
    }

    const updated = { ...driver, status: nextStatus, updatedAt: this.now() };
    this.drivers.set(driverId, updated);
    return { ok: true, data: cloneDriver(updated) };
  }

  private setDriverStatusOutsideTrip(driverId: string, nextStatus: Exclude<DriverStatus, "on_trip">): DriverResult<DriverRecord> {
    const driver = this.drivers.get(driverId);
    if (!driver) {
      return driverError({
        code: "DRIVER_NOT_FOUND",
        message: "Driver was not found.",
        recovery: "Refresh the driver list and choose an active driver.",
      });
    }

    if (driver.archivedAt !== null) {
      return driverError({
        code: "DRIVER_ARCHIVED",
        message: `${driver.name} is archived.`,
        recovery: "Choose an active driver.",
      });
    }

    if (driver.status === "on_trip") {
      return driverError({
        code: "DRIVER_ACTIVE_OPERATION",
        message: `${driver.name} is On Trip and cannot be changed directly.`,
        recovery: "Complete or cancel the active trip before changing driver status.",
      });
    }

    const updated = { ...driver, status: nextStatus, updatedAt: this.now() };
    this.drivers.set(driverId, updated);
    return { ok: true, data: cloneDriver(updated) };
  }
}
