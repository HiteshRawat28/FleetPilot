"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.integrationFixture = void 0;
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db = new client_1.PrismaClient();
exports.integrationFixture = {
    organizationSlug: "transitops-integration-fixture",
    otherOrganizationSlug: "transitops-integration-other",
    password: "Integration@123",
    driverEmail: "verified.driver.integration@transitops.test",
    managerEmail: "manager.integration@transitops.test",
    nonDriverEmail: "dispatcher.integration@transitops.test",
    tripId: "integration-trip-dispatched",
    completedTripId: "integration-trip-completed",
    otherTripId: "integration-other-trip",
};
async function removeFixtureOrganizations() {
    await db.organization.deleteMany({
        where: {
            slug: {
                in: [
                    exports.integrationFixture.organizationSlug,
                    exports.integrationFixture.otherOrganizationSlug,
                ],
            },
        },
    });
}
async function main() {
    await removeFixtureOrganizations();
    const passwordHash = await bcryptjs_1.default.hash(exports.integrationFixture.password, 4);
    const organization = await db.organization.create({
        data: {
            id: "integration-org",
            name: "TransitOps Integration Fleet",
            slug: exports.integrationFixture.organizationSlug,
            operationsEmail: exports.integrationFixture.managerEmail,
        },
    });
    const otherOrganization = await db.organization.create({
        data: {
            id: "integration-other-org",
            name: "Other Integration Fleet",
            slug: exports.integrationFixture.otherOrganizationSlug,
        },
    });
    const driverUser = await db.user.create({
        data: {
            id: "integration-driver-user",
            name: "Verified Integration Driver",
            email: exports.integrationFixture.driverEmail,
            passwordHash,
            role: client_1.Role.DRIVER,
            organizationId: organization.id,
            mustChangePassword: false,
        },
    });
    await db.user.createMany({
        data: [
            {
                id: "integration-manager-user",
                name: "Integration Fleet Manager",
                email: exports.integrationFixture.managerEmail,
                passwordHash,
                role: client_1.Role.FLEET_MANAGER,
                organizationId: organization.id,
            },
            {
                id: "integration-dispatcher-user",
                name: "Integration Dispatcher",
                email: exports.integrationFixture.nonDriverEmail,
                passwordHash,
                role: client_1.Role.DISPATCHER,
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
            licenseCategory: client_1.LicenseCategory.HMV,
            licenseExpiry: new Date("2032-12-31T00:00:00.000Z"),
            contact: "+91 90000 00001",
            status: client_1.DriverStatus.ON_TRIP,
            onboardingStatus: client_1.DriverOnboardingStatus.VERIFIED,
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
            requiredLicenseCategory: client_1.LicenseCategory.HMV,
            odometerKm: 42000,
            acquisitionCost: 2800000,
            status: client_1.VehicleStatus.ON_TRIP,
        },
    });
    await db.trip.create({
        data: {
            id: exports.integrationFixture.tripId,
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
            status: client_1.TripStatus.DISPATCHED,
            vehicleId: vehicle.id,
            driverId: driver.id,
            dispatchedAt: new Date(),
        },
    });
    await db.trip.create({
        data: {
            id: exports.integrationFixture.completedTripId,
            organizationId: organization.id,
            tripNo: "IT-DONE-001",
            source: "Bhopal",
            destination: "Sehore",
            cargoWeightKg: 1000,
            plannedDistanceKm: 40,
            revenue: 10000,
            status: client_1.TripStatus.COMPLETED,
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
            role: client_1.Role.DRIVER,
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
            licenseCategory: client_1.LicenseCategory.HMV,
            licenseExpiry: new Date("2032-12-31T00:00:00.000Z"),
            contact: "+91 90000 00002",
            status: client_1.DriverStatus.ON_TRIP,
            onboardingStatus: client_1.DriverOnboardingStatus.VERIFIED,
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
            requiredLicenseCategory: client_1.LicenseCategory.HMV,
            acquisitionCost: 2800000,
            status: client_1.VehicleStatus.ON_TRIP,
        },
    });
    await db.trip.create({
        data: {
            id: exports.integrationFixture.otherTripId,
            organizationId: otherOrganization.id,
            tripNo: "IT-OTHER-001",
            source: "Hidden Origin",
            destination: "Hidden Destination",
            cargoWeightKg: 1000,
            plannedDistanceKm: 25,
            status: client_1.TripStatus.DISPATCHED,
            vehicleId: otherVehicle.id,
            driverId: otherDriver.id,
            dispatchedAt: new Date(),
        },
    });
    console.log(`Integration seed ready: ${exports.integrationFixture.driverEmail} / ${exports.integrationFixture.password}`);
}
main()
    .catch((error) => {
    console.error(error);
    process.exitCode = 1;
})
    .finally(() => db.$disconnect());
