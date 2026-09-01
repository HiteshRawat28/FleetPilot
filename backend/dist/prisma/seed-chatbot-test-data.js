"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const db = new client_1.PrismaClient();
const marker = '[CHATBOT TEST]';
const tripNumbers = ['CHAT-STALE-001', 'CHAT-LIVE-001', 'CHAT-DONE-001', 'CHAT-CANCEL-001'];
const registrations = ['CHAT-LMV-0800', 'CHAT-LMV-2500', 'CHAT-HMV-6000', 'CHAT-SHOP-9000', 'CHAT-RETIRED-0700', 'CHAT-LIVE-5000', 'CHAT-TWIN-A', 'CHAT-TWIN-B'];
const licenceNumbers = ['CHAT-LIC-LMV-01', 'CHAT-LIC-LMV-02', 'CHAT-LIC-HMV-01', 'CHAT-LIC-HMV-EXPIRING', 'CHAT-LIC-EXPIRED', 'CHAT-LIC-SUSPENDED', 'CHAT-LIC-LIVE', 'CHAT-LIC-TWIN-A', 'CHAT-LIC-TWIN-B'];
const addDays = (date, days) => new Date(date.getTime() + days * 86_400_000);
const argValue = (name) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
async function removeScenarioData(organizationId, cleanResources) {
    const [vehicles, drivers, trips] = await Promise.all([
        db.vehicle.findMany({ where: { organizationId, registrationNo: { in: registrations } }, select: { id: true } }),
        db.driver.findMany({ where: { organizationId, licenseNo: { in: licenceNumbers } }, select: { id: true } }),
        db.trip.findMany({ where: { organizationId, OR: [{ tripNo: { in: tripNumbers } }, { source: { startsWith: 'Chat Test ' } }] }, select: { id: true } })
    ]);
    const vehicleIds = vehicles.map(item => item.id), driverIds = drivers.map(item => item.id), tripIds = trips.map(item => item.id);
    await db.$transaction([
        db.copilotAction.deleteMany({ where: { organizationId, tripId: { in: tripIds } } }),
        db.expense.deleteMany({ where: { organizationId, vehicleId: { in: vehicleIds } } }),
        db.fuelLog.deleteMany({ where: { organizationId, vehicleId: { in: vehicleIds } } }),
        db.maintenance.deleteMany({ where: { organizationId, vehicleId: { in: vehicleIds } } }),
        db.trip.deleteMany({ where: { id: { in: tripIds } } })
    ]);
    if (cleanResources) {
        await db.$transaction([
            db.driver.deleteMany({ where: { id: { in: driverIds }, trips: { none: {} } } }),
            db.vehicle.deleteMany({ where: { id: { in: vehicleIds }, trips: { none: {} } } })
        ]);
    }
}
async function main() {
    const positionalSlug = process.argv.slice(2).find(value => !value.startsWith('--'));
    const slug = argValue('org') || process.env.CHATBOT_TEST_ORG_SLUG || positionalSlug;
    if (!slug)
        throw new Error('Choose a tenant explicitly: npm run db:seed:chatbot -- <organization-slug>');
    const organization = await db.organization.findUnique({ where: { slug }, select: { id: true, name: true } });
    if (!organization)
        throw new Error(`Organization "${slug}" was not found.`);
    const clean = process.argv.includes('--clean');
    await removeScenarioData(organization.id, clean);
    if (clean) {
        console.log(`Removed chatbot test scenario data from ${organization.name} (${slug}).`);
        return;
    }
    const now = new Date();
    const vehicleSpecs = [
        { registrationNo: 'CHAT-LMV-0800', name: 'Chat Compact Van', type: 'Van', capacityKg: 800, requiredLicenseCategory: client_1.LicenseCategory.LMV, odometerKm: 48200, acquisitionCost: 650000, status: client_1.VehicleStatus.AVAILABLE, region: 'North' },
        { registrationNo: 'CHAT-LMV-2500', name: 'Chat Cargo 25', type: 'Light Truck', capacityKg: 2500, requiredLicenseCategory: client_1.LicenseCategory.LMV, odometerKm: 88500, acquisitionCost: 1250000, status: client_1.VehicleStatus.AVAILABLE, region: 'North' },
        { registrationNo: 'CHAT-HMV-6000', name: 'Chat Heavy 60', type: 'Truck', capacityKg: 6000, requiredLicenseCategory: client_1.LicenseCategory.HMV, odometerKm: 131000, acquisitionCost: 2600000, status: client_1.VehicleStatus.AVAILABLE, region: 'West' },
        { registrationNo: 'CHAT-SHOP-9000', name: 'Chat Workshop Truck', type: 'Heavy Truck', capacityKg: 9000, requiredLicenseCategory: client_1.LicenseCategory.HMV, odometerKm: 176000, acquisitionCost: 3400000, status: client_1.VehicleStatus.IN_SHOP, region: 'South' },
        { registrationNo: 'CHAT-RETIRED-0700', name: 'Chat Retired Van', type: 'Van', capacityKg: 700, requiredLicenseCategory: client_1.LicenseCategory.LMV, odometerKm: 310000, acquisitionCost: 520000, status: client_1.VehicleStatus.RETIRED, region: 'East' },
        { registrationNo: 'CHAT-LIVE-5000', name: 'Chat Live Truck', type: 'Truck', capacityKg: 5000, requiredLicenseCategory: client_1.LicenseCategory.HMV, odometerKm: 204000, acquisitionCost: 2400000, status: client_1.VehicleStatus.ON_TRIP, region: 'West' },
        { registrationNo: 'CHAT-TWIN-A', name: 'Chat Twin Van', type: 'Van', capacityKg: 1100, requiredLicenseCategory: client_1.LicenseCategory.LMV, odometerKm: 32000, acquisitionCost: 710000, status: client_1.VehicleStatus.AVAILABLE, region: 'Central' },
        { registrationNo: 'CHAT-TWIN-B', name: 'Chat Twin Van', type: 'Van', capacityKg: 1200, requiredLicenseCategory: client_1.LicenseCategory.LMV, odometerKm: 35000, acquisitionCost: 730000, status: client_1.VehicleStatus.AVAILABLE, region: 'Central' }
    ];
    const vehicles = new Map();
    for (const spec of vehicleSpecs) {
        const row = await db.vehicle.upsert({ where: { organizationId_registrationNo: { organizationId: organization.id, registrationNo: spec.registrationNo } }, create: { organizationId: organization.id, ...spec }, update: spec });
        vehicles.set(spec.registrationNo, row);
    }
    const driverSpecs = [
        { licenseNo: 'CHAT-LIC-LMV-01', name: 'Chat Safe Driver', licenseCategory: client_1.LicenseCategory.LMV, licenseExpiry: addDays(now, 540), contact: '+91 90000 00001', safetyScore: 98, status: client_1.DriverStatus.AVAILABLE },
        { licenseNo: 'CHAT-LIC-LMV-02', name: 'Chat Backup Driver', licenseCategory: client_1.LicenseCategory.LMV, licenseExpiry: addDays(now, 400), contact: '+91 90000 00002', safetyScore: 86, status: client_1.DriverStatus.AVAILABLE },
        { licenseNo: 'CHAT-LIC-HMV-01', name: 'Chat Heavy Driver', licenseCategory: client_1.LicenseCategory.HMV, licenseExpiry: addDays(now, 600), contact: '+91 90000 00003', safetyScore: 96, status: client_1.DriverStatus.AVAILABLE },
        { licenseNo: 'CHAT-LIC-HMV-EXPIRING', name: 'Chat Expiring Driver', licenseCategory: client_1.LicenseCategory.HMV, licenseExpiry: addDays(now, 10), contact: '+91 90000 00004', safetyScore: 82, status: client_1.DriverStatus.AVAILABLE },
        { licenseNo: 'CHAT-LIC-EXPIRED', name: 'Chat Expired Driver', licenseCategory: client_1.LicenseCategory.LMV, licenseExpiry: addDays(now, -5), contact: '+91 90000 00005', safetyScore: 91, status: client_1.DriverStatus.AVAILABLE },
        { licenseNo: 'CHAT-LIC-SUSPENDED', name: 'Chat Suspended Driver', licenseCategory: client_1.LicenseCategory.HMV, licenseExpiry: addDays(now, 365), contact: '+91 90000 00006', safetyScore: 55, status: client_1.DriverStatus.SUSPENDED },
        { licenseNo: 'CHAT-LIC-LIVE', name: 'Chat Live Driver', licenseCategory: client_1.LicenseCategory.HMV, licenseExpiry: addDays(now, 365), contact: '+91 90000 00007', safetyScore: 88, status: client_1.DriverStatus.ON_TRIP },
        { licenseNo: 'CHAT-LIC-TWIN-A', name: 'Chat Twin Driver', licenseCategory: client_1.LicenseCategory.LMV, licenseExpiry: addDays(now, 365), contact: '+91 90000 00008', safetyScore: 90, status: client_1.DriverStatus.AVAILABLE },
        { licenseNo: 'CHAT-LIC-TWIN-B', name: 'Chat Twin Driver', licenseCategory: client_1.LicenseCategory.LMV, licenseExpiry: addDays(now, 365), contact: '+91 90000 00009', safetyScore: 89, status: client_1.DriverStatus.AVAILABLE }
    ];
    const drivers = new Map();
    for (const spec of driverSpecs) {
        const row = await db.driver.upsert({ where: { organizationId_licenseNo: { organizationId: organization.id, licenseNo: spec.licenseNo } }, create: { organizationId: organization.id, ...spec }, update: spec });
        drivers.set(spec.licenseNo, row);
    }
    const vehicle = (registration) => vehicles.get(registration).id;
    const driver = (licence) => drivers.get(licence).id;
    await db.trip.createMany({ data: [
            { organizationId: organization.id, tripNo: 'CHAT-STALE-001', source: 'Chat Test Jaipur Depot', destination: 'Chat Test Ajmer Hub', cargoWeightKg: 600, plannedDistanceKm: 135, revenue: 15000, estimatedTollsInr: 800, status: client_1.TripStatus.DRAFT, vehicleId: vehicle('CHAT-LMV-0800'), driverId: driver('CHAT-LIC-LMV-02'), createdAt: addDays(now, -14) },
            { organizationId: organization.id, tripNo: 'CHAT-LIVE-001', source: 'Chat Test Delhi Depot', destination: 'Chat Test Chandigarh Hub', cargoWeightKg: 4200, plannedDistanceKm: 245, revenue: 52000, estimatedTollsInr: 2200, status: client_1.TripStatus.DISPATCHED, vehicleId: vehicle('CHAT-LIVE-5000'), driverId: driver('CHAT-LIC-LIVE'), createdAt: addDays(now, -2), dispatchedAt: addDays(now, -1) },
            { organizationId: organization.id, tripNo: 'CHAT-DONE-001', source: 'Chat Test Jaipur Depot', destination: 'Chat Test Kota Hub', cargoWeightKg: 1800, plannedDistanceKm: 252, revenue: 36000, estimatedTollsInr: 1400, status: client_1.TripStatus.COMPLETED, vehicleId: vehicle('CHAT-LMV-2500'), driverId: driver('CHAT-LIC-LMV-01'), createdAt: addDays(now, -20), dispatchedAt: addDays(now, -19), completedAt: addDays(now, -18), finalOdometerKm: 88500, fuelConsumedL: 31 },
            { organizationId: organization.id, tripNo: 'CHAT-CANCEL-001', source: 'Chat Test Udaipur Depot', destination: 'Chat Test Jodhpur Hub', cargoWeightKg: 900, plannedDistanceKm: 250, revenue: 28000, estimatedTollsInr: 1100, status: client_1.TripStatus.CANCELLED, vehicleId: vehicle('CHAT-LMV-2500'), driverId: driver('CHAT-LIC-LMV-02'), createdAt: addDays(now, -8) }
        ] });
    await db.maintenance.createMany({ data: [
            { organizationId: organization.id, vehicleId: vehicle('CHAT-SHOP-9000'), serviceType: `${marker} Brake overhaul`, description: 'Active maintenance risk for Copilot testing', cost: 48000, startDate: addDays(now, -20), status: client_1.MaintenanceStatus.ACTIVE },
            { organizationId: organization.id, vehicleId: vehicle('CHAT-LMV-2500'), serviceType: `${marker} Scheduled service`, description: 'Closed maintenance cost for analytics testing', cost: 12500, startDate: addDays(now, -45), endDate: addDays(now, -43), status: client_1.MaintenanceStatus.CLOSED }
        ] });
    await db.fuelLog.createMany({ data: [
            { organizationId: organization.id, vehicleId: vehicle('CHAT-LMV-2500'), liters: 31, cost: 3255, date: addDays(now, -5), odometerKm: 88500 },
            { organizationId: organization.id, vehicleId: vehicle('CHAT-HMV-6000'), liters: 95, cost: 9975, date: addDays(now, -18), odometerKm: 131000 },
            { organizationId: organization.id, vehicleId: vehicle('CHAT-LMV-0800'), liters: 22, cost: 2310, date: addDays(now, -70), odometerKm: 48200 }
        ] });
    await db.expense.createMany({ data: [
            { organizationId: organization.id, vehicleId: vehicle('CHAT-LMV-2500'), type: client_1.ExpenseType.TOLL, description: `${marker} Jaipur expressway toll`, amount: 1400, date: addDays(now, -5) },
            { organizationId: organization.id, vehicleId: vehicle('CHAT-SHOP-9000'), type: client_1.ExpenseType.REPAIR, description: `${marker} Brake parts`, amount: 18000, date: addDays(now, -12) },
            { organizationId: organization.id, vehicleId: vehicle('CHAT-HMV-6000'), type: client_1.ExpenseType.INSURANCE, description: `${marker} Annual insurance`, amount: 42000, date: addDays(now, -65) }
        ] });
    console.log(`Loaded chatbot test scenarios into ${organization.name} (${slug}).`);
    console.log('Created 8 vehicles, 9 drivers, 4 trips, 2 maintenance records, 3 fuel logs, and 3 expenses.');
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => db.$disconnect());
