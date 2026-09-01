import { PrismaClient, Role, VehicleStatus, DriverStatus, TripStatus, MaintenanceStatus, ExpenseType, LicenseCategory } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();
async function main() {
  await db.fastagTransaction.deleteMany(); await db.fastagConnection.deleteMany(); await db.tripEvidence.deleteMany(); await db.driverDocument.deleteMany();
  await db.expense.deleteMany(); await db.fuelLog.deleteMany(); await db.maintenance.deleteMany();
  await db.trip.deleteMany(); await db.driver.deleteMany(); await db.vehicle.deleteMany(); await db.user.deleteMany(); await db.organization.deleteMany();
  const passwordHash = await bcrypt.hash('Password@123', 12);
  const organization=await db.organization.create({data:{name:'TransitOps India Pvt. Ltd.',slug:'transitops-india',operationsEmail:'operations@transitops.in'}});
  const organizationId=organization.id;
  await db.user.createMany({ data: [
    { name:'Aarav Sharma', email:'owner@transitops.in', passwordHash, role:Role.OWNER, organizationId },
    { name:'Raven Kumar', email:'manager@transitops.in', passwordHash, role:Role.FLEET_MANAGER, organizationId },
    { name:'Raven Kumar', email:'dispatcher@transitops.in', passwordHash, role:Role.DISPATCHER, organizationId },
    { name:'Neha Singh', email:'safety@transitops.in', passwordHash, role:Role.SAFETY_OFFICER, organizationId },
    { name:'Arjun Mehta', email:'finance@transitops.in', passwordHash, role:Role.FINANCIAL_ANALYST, organizationId }
  ]});
  const [van, truck, mini, retired] = await Promise.all([
    db.vehicle.create({data:{organizationId,registrationNo:'GJ01AB4523',name:'Van-05',type:'Van',capacityKg:500,requiredLicenseCategory:LicenseCategory.LMV,odometerKm:74000,acquisitionCost:620000,status:VehicleStatus.AVAILABLE,region:'West'}}),
    db.vehicle.create({data:{organizationId,registrationNo:'GJ01AB7898',name:'Truck-11',type:'Truck',capacityKg:5000,requiredLicenseCategory:LicenseCategory.HMV,odometerKm:182000,acquisitionCost:2450000,status:VehicleStatus.ON_TRIP,region:'West'}}),
    db.vehicle.create({data:{organizationId,registrationNo:'GJ01AB1120',name:'Mini-09',type:'Mini Truck',capacityKg:1000,requiredLicenseCategory:LicenseCategory.LMV,odometerKm:66000,acquisitionCost:410000,status:VehicleStatus.IN_SHOP,region:'North'}}),
    db.vehicle.create({data:{organizationId,registrationNo:'GJ01AB0098',name:'Van-09',type:'Van',capacityKg:750,requiredLicenseCategory:LicenseCategory.LMV,odometerKm:249000,acquisitionCost:540000,status:VehicleStatus.RETIRED,region:'South'}})
  ]);
  const [alex,john,priya,suresh] = await Promise.all([
    db.driver.create({data:{organizationId,name:'Alex',licenseNo:'DL-7785',licenseCategory:LicenseCategory.LMV,licenseExpiry:new Date('2028-12-10'),contact:'+91 98765 43000',safetyScore:96,status:DriverStatus.AVAILABLE}}),
    db.driver.create({data:{organizationId,name:'John',licenseNo:'DL-9960',licenseCategory:LicenseCategory.HMV,licenseExpiry:new Date('2027-11-15'),contact:'+91 98220 44110',safetyScore:89,status:DriverStatus.ON_TRIP}}),
    db.driver.create({data:{organizationId,name:'Priya',licenseNo:'DL-7705',licenseCategory:LicenseCategory.LMV,licenseExpiry:new Date('2027-10-30'),contact:'+91 97650 33211',safetyScore:98,status:DriverStatus.OFF_DUTY}}),
    db.driver.create({data:{organizationId,name:'Suresh',licenseNo:'DL-4005',licenseCategory:LicenseCategory.HMV,licenseExpiry:new Date('2025-01-20'),contact:'+91 99000 55222',safetyScore:72,status:DriverStatus.SUSPENDED}})
  ]);
  await db.trip.createMany({data:[
    {organizationId,tripNo:'TRP001',source:'Ahmedabad Depot',destination:'Surat Warehouse',cargoWeightKg:3200,plannedDistanceKm:265,revenue:45000,status:TripStatus.DISPATCHED,vehicleId:truck.id,driverId:john.id,dispatchedAt:new Date()},
    {organizationId,tripNo:'TRP002',source:'Vadodara',destination:'Ahmedabad',cargoWeightKg:350,plannedDistanceKm:112,revenue:18000,status:TripStatus.COMPLETED,vehicleId:van.id,driverId:alex.id,finalOdometerKm:74000,fuelConsumedL:42,completedAt:new Date('2026-08-28')}
  ]});
  await db.maintenance.create({data:{organizationId,vehicleId:mini.id,serviceType:'Oil Change',description:'Engine oil and filter replacement',cost:8500,status:MaintenanceStatus.ACTIVE}});
  await db.fuelLog.createMany({data:[{organizationId,vehicleId:van.id,liters:42,cost:5170,date:new Date('2026-08-28'),odometerKm:74000},{organizationId,vehicleId:truck.id,liters:80,cost:9600,date:new Date('2026-08-29'),odometerKm:182000}]});
  await db.expense.create({data:{organizationId,vehicleId:truck.id,type:ExpenseType.TOLL,description:'Expressway toll',amount:3200}});
  console.log('Seed complete. Owner login: owner@transitops.in / Password@123');
}
main().finally(()=>db.$disconnect());
