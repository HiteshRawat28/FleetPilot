import {
  DriverOnboardingStatus,
  DriverStatus,
  LicenseCategory,
  PrismaClient,
  Role,
  TripStatus,
  VehicleStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

export const integrationFixture = {
  organizationSlug: "transitops-integration-fixture",
  otherOrganizationSlug: "transitops-integration-other",
  password: "Integration@123",
  driverEmail: "verified.driver.integration@transitops.test",
  managerEmail: "manager.integration@transitops.test",
  nonDriverEmail: "dispatcher.integration@transitops.test",
  tripId: "integration-trip-dispatched",
  completedTripId: "integration-trip-completed",
  otherTripId: "integration-other-trip",
} as const;

async function removeFixtureOrganizations() {
  await db.organization.deleteMany({
    where: {
      slug: {
        in: [
          integrationFixture.organizationSlug,
          integrationFixture.otherOrganizationSlug,
        ],
      },
    },
  });
}

async function main() {
  await removeFixtureOrganizations();
  const passwordHash = await bcrypt.hash(integrationFixture.password, 4);

  const organization = await db.organization.create({
    data: {
      id: "integration-org",
      name: "TransitOps Integration Fleet",
      slug: integrationFixture.organizationSlug,
      operationsEmail: integrationFixture.managerEmail,
    },
  });
  const otherOrganization = await db.organization.create({
    data: {
      id: "integration-other-org",
      name: "Other Integration Fleet",
      slug: integrationFixture.otherOrganizationSlug,
    },
  });

  const driverUser = await db.user.create({
    data: {
      id: "integration-driver-user",
      name: "Verified Integration Driver",
      email: integrationFixture.driverEmail,
      passwordHash,
      role: Role.DRIVER,
      organizationId: organization.id,
      mustChangePassword: false,
    },
  });
  await db.user.createMany({
    data: [
      {
        id: "integration-manager-user",
        name: "Integration Fleet Manager",
        email: integrationFixture.managerEmail,
        passwordHash,
        role: Role.FLEET_MANAGER,
        organizationId: organization.id,
      },
      {
        id: "integration-dispatcher-user",
        name: "Integration Dispatcher",
        email: integrationFixture.nonDriverEmail,
        passwordHash,
        role: Role.DISPATCHER,
        organizationId: organization.id,
      },
    ],
  });

  const driver = await db.driver.create({
    data: {
      id: "integration-driver",
      organizationId: organization.id,
      userId: driverUser.id,
      name: "Verified Integration Driver",
      licenseNo: "IT-HMV-001",
      licenseCategory: LicenseCategory.HMV,
      licenseExpiry: new Date("2032-12-31T00:00:00.000Z"),
      contact: "+91 90000 00001",
      status: DriverStatus.ON_TRIP,
      onboardingStatus: DriverOnboardingStatus.VERIFIED,
      verifiedAt: new Date(),
    },
  });
  const vehicle = await db.vehicle.create({
    data: {
      id: "integration-vehicle",
      organizationId: organization.id,
      registrationNo: "MP04IT0001",
      name: "Integration Truck",
      type: "Truck",
      capacityKg: 16000,
      requiredLicenseCategory: LicenseCategory.HMV,
      odometerKm: 42000,
      acquisitionCost: 2800000,
      status: VehicleStatus.ON_TRIP,
    },
  });
  await db.trip.create({
    data: {
      id: integrationFixture.tripId,
      organizationId: organization.id,
      tripNo: "IT-LIVE-001",
      source: "Bhopal Depot",
      destination: "Indore Warehouse",
      sourceLatitude: 23.2599,
      sourceLongitude: 77.4126,
      destinationLatitude: 22.7196,
      destinationLongitude: 75.8577,
      cargoWeightKg: 8000,
      plannedDistanceKm: 195,
      revenue: 42000,
      status: TripStatus.DISPATCHED,
      vehicleId: vehicle.id,
      driverId: driver.id,
      dispatchedAt: new Date(),
    },
  });
  await db.trip.create({
    data: {
      id: integrationFixture.completedTripId,
      organizationId: organization.id,
      tripNo: "IT-DONE-001",
      source: "Bhopal",
      destination: "Sehore",
      cargoWeightKg: 1000,
      plannedDistanceKm: 40,
      revenue: 10000,
      status: TripStatus.COMPLETED,
      vehicleId: vehicle.id,
      driverId: driver.id,
      dispatchedAt: new Date("2026-08-30T08:00:00.000Z"),
      startedAt: new Date("2026-08-30T08:05:00.000Z"),
      completedAt: new Date("2026-08-30T09:00:00.000Z"),
    },
  });

  const otherUser = await db.user.create({
    data: {
      id: "integration-other-driver-user",
      name: "Other Driver",
      email: "other.driver.integration@transitops.test",
      passwordHash,
      role: Role.DRIVER,
      organizationId: otherOrganization.id,
    },
  });
  const otherDriver = await db.driver.create({
    data: {
      id: "integration-other-driver",
      organizationId: otherOrganization.id,
      userId: otherUser.id,
      name: "Other Driver",
      licenseNo: "IT-HMV-OTHER",
      licenseCategory: LicenseCategory.HMV,
      licenseExpiry: new Date("2032-12-31T00:00:00.000Z"),
      contact: "+91 90000 00002",
      status: DriverStatus.ON_TRIP,
      onboardingStatus: DriverOnboardingStatus.VERIFIED,
    },
  });
  const otherVehicle = await db.vehicle.create({
    data: {
      id: "integration-other-vehicle",
      organizationId: otherOrganization.id,
      registrationNo: "MP04IT9999",
      name: "Other Truck",
      type: "Truck",
      capacityKg: 16000,
      requiredLicenseCategory: LicenseCategory.HMV,
      acquisitionCost: 2800000,
      status: VehicleStatus.ON_TRIP,
    },
  });
  await db.trip.create({
    data: {
      id: integrationFixture.otherTripId,
      organizationId: otherOrganization.id,
      tripNo: "IT-OTHER-001",
      source: "Hidden Origin",
      destination: "Hidden Destination",
      cargoWeightKg: 1000,
      plannedDistanceKm: 25,
      status: TripStatus.DISPATCHED,
      vehicleId: otherVehicle.id,
      driverId: otherDriver.id,
      dispatchedAt: new Date(),
    },
  });

  console.log(
    `Integration seed ready: ${integrationFixture.driverEmail} / ${integrationFixture.password}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
