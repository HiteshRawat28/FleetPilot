import { PrismaClient, Role, VehicleStatus, DriverStatus, TripStatus, MaintenanceStatus, ExpenseType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();
async function main() {
  await db.expense.deleteMany(); await db.fuelLog.deleteMany(); await db.maintenance.deleteMany();
  await db.trip.deleteMany(); await db.driver.deleteMany(); await db.vehicle.deleteMany(); await db.user.deleteMany();
  const passwordHash = await bcrypt.hash('Password@123', 12);
  await db.user.createMany({ data: [
    { name:'Raven Kumar', email:'manager@transitops.in', passwordHash, role:Role.FLEET_MANAGER },
    { name:'Raven Kumar', email:'dispatcher@transitops.in', passwordHash, role:Role.DISPATCHER },
    { name:'Neha Singh', email:'safety@transitops.in', passwordHash, role:Role.SAFETY_OFFICER },
    { name:'Arjun Mehta', email:'finance@transitops.in', passwordHash, role:Role.FINANCIAL_ANALYST }
  ]});
  const [van, truck, mini, retired] = await Promise.all([
    db.vehicle.create({data:{registrationNo:'GJ01AB4523',name:'Van-05',type:'Van',capacityKg:500,odometerKm:74000,acquisitionCost:620000,status:VehicleStatus.AVAILABLE,region:'West'}}),
    db.vehicle.create({data:{registrationNo:'GJ01AB7898',name:'Truck-11',type:'Truck',capacityKg:5000,odometerKm:182000,acquisitionCost:2450000,status:VehicleStatus.ON_TRIP,region:'West'}}),
    db.vehicle.create({data:{registrationNo:'GJ01AB1120',name:'Mini-09',type:'Mini Truck',capacityKg:1000,odometerKm:66000,acquisitionCost:410000,status:VehicleStatus.IN_SHOP,region:'North'}}),
    db.vehicle.create({data:{registrationNo:'GJ01AB0098',name:'Van-09',type:'Van',capacityKg:750,odometerKm:249000,acquisitionCost:540000,status:VehicleStatus.RETIRED,region:'South'}})
  ]);
  const [alex,john,priya,suresh] = await Promise.all([
    db.driver.create({data:{name:'Alex',licenseNo:'DL-7785',licenseCategory:'LMV',licenseExpiry:new Date('2028-12-10'),contact:'+91 98765 43000',safetyScore:96,status:DriverStatus.AVAILABLE}}),
    db.driver.create({data:{name:'John',licenseNo:'DL-9960',licenseCategory:'HMV',licenseExpiry:new Date('2027-11-15'),contact:'+91 98220 44110',safetyScore:89,status:DriverStatus.ON_TRIP}}),
    db.driver.create({data:{name:'Priya',licenseNo:'DL-7705',licenseCategory:'LMV',licenseExpiry:new Date('2027-10-30'),contact:'+91 97650 33211',safetyScore:98,status:DriverStatus.OFF_DUTY}}),
    db.driver.create({data:{name:'Suresh',licenseNo:'DL-4005',licenseCategory:'HMV',licenseExpiry:new Date('2025-01-20'),contact:'+91 99000 55222',safetyScore:72,status:DriverStatus.SUSPENDED}})
  ]);
  await db.trip.createMany({data:[
    {tripNo:'TRP001',source:'Ahmedabad Depot',destination:'Surat Warehouse',cargoWeightKg:3200,plannedDistanceKm:265,revenue:45000,status:TripStatus.DISPATCHED,vehicleId:truck.id,driverId:john.id,dispatchedAt:new Date()},
    {tripNo:'TRP002',source:'Vadodara',destination:'Ahmedabad',cargoWeightKg:350,plannedDistanceKm:112,revenue:18000,status:TripStatus.COMPLETED,vehicleId:van.id,driverId:alex.id,finalOdometerKm:74000,fuelConsumedL:42,completedAt:new Date('2026-08-28')}
  ]});
  await db.maintenance.create({data:{vehicleId:mini.id,serviceType:'Oil Change',description:'Engine oil and filter replacement',cost:8500,status:MaintenanceStatus.ACTIVE}});
  await db.fuelLog.createMany({data:[{vehicleId:van.id,liters:42,cost:5170,date:new Date('2026-08-28'),odometerKm:74000},{vehicleId:truck.id,liters:80,cost:9600,date:new Date('2026-08-29'),odometerKm:182000}]});
  await db.expense.create({data:{vehicleId:truck.id,type:ExpenseType.TOLL,description:'Expressway toll',amount:3200}});
  console.log('Seed complete. Login: dispatcher@transitops.in / Password@123');
}
main().finally(()=>db.$disconnect());
