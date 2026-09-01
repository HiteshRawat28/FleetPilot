import {describe,expect,it} from 'vitest';
import {calculateFleetAnalytics} from './fleetAnalytics';

const now=new Date('2026-09-15T00:00:00.000Z');
const vehicles=[
  {id:'v1',name:'Truck 01',registrationNo:'MP04AA0001',type:'Truck',region:'Central',status:'ON_TRIP',acquisitionCost:1_000_000},
  {id:'v2',name:'Van 02',registrationNo:'MP04AA0002',type:'Van',region:'Central',status:'AVAILABLE',acquisitionCost:500_000},
  {id:'v3',name:'Legacy 03',registrationNo:'MP04AA0003',type:'Truck',region:'Central',status:'RETIRED',acquisitionCost:500_000},
];
const trips=[
  {vehicleId:'v1',revenue:100_000,plannedDistanceKm:400,fuelConsumedL:80,status:'COMPLETED',createdAt:new Date('2026-08-01'),completedAt:new Date('2026-08-03')},
  {vehicleId:'v2',revenue:25_000,plannedDistanceKm:100,fuelConsumedL:20,status:'COMPLETED',createdAt:new Date('2026-09-01'),completedAt:new Date('2026-09-02')},
  {vehicleId:'v1',revenue:70_000,plannedDistanceKm:300,fuelConsumedL:null,status:'DRAFT',createdAt:new Date('2026-09-10'),completedAt:null},
];
const fuel=[{vehicleId:'v1',cost:10_000,liters:100,date:new Date('2026-08-02')},{vehicleId:'v2',cost:2_000,liters:20,date:new Date('2026-09-02')}];
const maintenance=[{vehicleId:'v1',cost:5_000,startDate:new Date('2026-08-02')}];
const expenses=[{vehicleId:'v1',amount:1_500,type:'TOLL',date:new Date('2026-08-02')},{vehicleId:'v1',amount:2_500,type:'DRIVER_PAYMENT',date:new Date('2026-08-03')},{vehicleId:'v2',amount:1_000,type:'FOOD',date:new Date('2026-09-02')}];

describe('calculateFleetAnalytics',()=>{
  it('calculates realized fleet performance without counting draft revenue',()=>{
    const result=calculateFleetAnalytics({vehicles,fuel,maintenance,expenses,trips,now});
    expect(result.summary).toMatchObject({realizedRevenue:125000,operationalCost:22000,realizedProfit:103000,profitMargin:82.4,costPerKm:44,fuelEfficiency:5,completedTrips:2,totalDistanceKm:500,fleetUtilization:50});
    expect(result.costBreakdown).toEqual({fuel:12000,maintenance:5000,tolls:1500,driverPayments:2500,otherExpenses:1000});
  });

  it('returns per-vehicle profitability and six chronological monthly buckets',()=>{
    const result=calculateFleetAnalytics({vehicles,fuel,maintenance,expenses,trips,now});
    expect(result.byVehicle.find(row=>row.id==='v1')).toMatchObject({completedTrips:1,totalTrips:2,revenue:100000,operationalCost:19000,profit:81000,marginPercent:81,costPerKm:47.5,roi:8.1});
    expect(result.monthlyTrend).toHaveLength(6);
    expect(result.monthlyTrend.slice(-2)).toEqual([
      {month:'2026-08',label:'Aug 26',revenue:100000,cost:19000,profit:81000,completedTrips:1},
      {month:'2026-09',label:'Sept 26',revenue:25000,cost:3000,profit:22000,completedTrips:1},
    ]);
  });

  it('handles an empty fleet without NaN or misleading percentages',()=>{
    const result=calculateFleetAnalytics({vehicles:[],fuel:[],maintenance:[],expenses:[],trips:[],now});
    expect(result.summary).toMatchObject({fuelEfficiency:0,fleetUtilization:0,operationalCost:0,vehicleRoi:0,realizedRevenue:0,realizedProfit:0,profitMargin:null,costPerKm:null});
    expect(result.byVehicle).toEqual([]);
  });
});
