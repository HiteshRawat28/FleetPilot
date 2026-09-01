import { describe,expect,it } from 'vitest';
import { PrismaClient, Role } from '@prisma/client';
import { executeTool } from './chat';
import { disclosurePolicyForRole,driverForCopilot,recentTripsForCopilot,sanitizeCopilotText,tripForCopilot,vehicleForCopilot } from './security';

const driver={name:'Driver A',licenseNo:'LIC-SENSITIVE-01',licenseCategory:'LMV',licenseExpiry:new Date('2028-01-01'),status:'AVAILABLE',safetyScore:95};
const trip={tripNo:'TRP001',source:'A',destination:'B',status:'DRAFT',cargoWeightKg:100,plannedDistanceKm:20,revenue:9000,createdAt:new Date('2026-01-01'),vehicle:{name:'Van',registrationNo:'REG001'},driver:{name:'Driver A'}};

describe('Copilot role disclosure policy',()=>{
  it('restricts financial analytics to financial and elevated operational roles',()=>{
    expect(disclosurePolicyForRole(Role.SAFETY_OFFICER).financialAnalytics).toBe(false);
    expect(disclosurePolicyForRole(Role.DISPATCHER).financialAnalytics).toBe(false);
    expect(disclosurePolicyForRole(Role.FINANCIAL_ANALYST).financialAnalytics).toBe(true);
    expect(disclosurePolicyForRole(Role.FLEET_MANAGER).financialAnalytics).toBe(true);
  });

  it('removes driver licence numbers from dispatcher payloads',()=>{
    expect(driverForCopilot(driver,Role.DISPATCHER)).not.toHaveProperty('licenseNo');
    expect(driverForCopilot(driver,Role.SAFETY_OFFICER)).toHaveProperty('licenseNo','LIC-SENSITIVE-01');
  });

  it('removes trip revenue from dispatcher payloads',()=>{
    expect(tripForCopilot(trip,Role.DISPATCHER)).not.toHaveProperty('revenue');
    expect(tripForCopilot(trip,Role.FLEET_MANAGER)).toHaveProperty('revenue',9000);
  });

  it('hides recent trip identities from safety and finance roles',()=>{
    expect(recentTripsForCopilot([trip],Role.SAFETY_OFFICER)).toEqual([]);
    expect(recentTripsForCopilot([trip],Role.FINANCIAL_ANALYST)).toEqual([]);
    expect(recentTripsForCopilot([trip],Role.DISPATCHER)).toHaveLength(1);
  });

  it('never includes Prisma ids in projected vehicle records',()=>{
    const databaseVehicle={...driver,name:'Van',registrationNo:'REG001',type:'Van',capacityKg:500,requiredLicenseCategory:'LMV',region:'North',odometerKm:10,id:'internal-id'};
    expect(vehicleForCopilot(databaseVehicle)).not.toHaveProperty('id');
  });
});

describe('Copilot deterministic output sanitizer',()=>{
  it('redacts known tenant and record identifiers',()=>expect(sanitizeCopilotText('Org org-secret and row cuid-secret-value',['org-secret','cuid-secret-value'])).toBe('Org [restricted] and row [restricted]'));
  it('redacts JWTs and UUIDs',()=>{
    const text='eyJheaderpart12345.eyJpayloadpart12345.signature123 and 123e4567-e89b-42d3-a456-426614174000 and cm7abcdefghijklmnopqrstuv';
    expect(sanitizeCopilotText(text)).toBe('[restricted token] and [restricted id] and [restricted id]');
  });
});

describe('Copilot tenant and field enforcement at the tool boundary',()=>{
  const user={id:'user-a',name:'Dispatcher',role:Role.DISPATCHER,organizationId:'tenant-a',organizationName:'Tenant A'};

  it('always applies the authenticated organization to vehicle queries and drops database ids',async()=>{
    let where:Record<string,unknown>|undefined;
    const fakeDb={vehicle:{findMany:async(args:{where:Record<string,unknown>})=>{where=args.where;return[{id:'private-row-id',organizationId:'tenant-b',name:'Van A',registrationNo:'REG-A',type:'Van',status:'AVAILABLE',capacityKg:500,requiredLicenseCategory:'LMV',region:'North',odometerKm:20}]}}};
    const result=await executeTool(fakeDb as unknown as PrismaClient,user,'search_vehicles',{organizationId:'tenant-b',query:null,status:null,limit:5});
    expect(where).toMatchObject({organizationId:'tenant-a',status:'AVAILABLE'});
    expect(JSON.stringify(result.data)).not.toContain('private-row-id');
    expect(JSON.stringify(result.data)).not.toContain('tenant-b');
  });

  it('removes licence numbers from dispatcher driver tool results',async()=>{
    const fakeDb={driver:{findMany:async()=>[{id:'driver-private-id',name:'Driver A',licenseNo:'LIC-PRIVATE',licenseCategory:'LMV',licenseExpiry:new Date('2028-01-01'),status:'AVAILABLE',safetyScore:90}]}};
    const result=await executeTool(fakeDb as unknown as PrismaClient,user,'search_drivers',{query:null,status:null,expiringWithinDays:null,limit:5});
    expect(JSON.stringify(result.data)).not.toContain('LIC-PRIVATE');
    expect(JSON.stringify(result.data)).not.toContain('driver-private-id');
  });

  it('removes revenue from dispatcher trip tool results',async()=>{
    const fakeDb={trip:{findMany:async()=>[{id:'trip-private-id',tripNo:'TRP001',source:'A',destination:'B',status:'DRAFT',cargoWeightKg:100,plannedDistanceKm:20,revenue:999999,createdAt:new Date('2026-01-01'),vehicle:{name:'Van',registrationNo:'REG-A'},driver:{name:'Driver A'}}]}};
    const result=await executeTool(fakeDb as unknown as PrismaClient,user,'search_trips',{query:null,status:null,limit:5});
    expect(JSON.stringify(result.data)).not.toContain('999999');
    expect(JSON.stringify(result.data)).not.toContain('trip-private-id');
  });

  it('does not reveal licence numbers while asking a dispatcher to disambiguate drivers',async()=>{
    const fakeDb={
      vehicle:{findMany:async()=>[{id:'vehicle-a',name:'Van A',registrationNo:'REG-A'}]},
      driver:{findMany:async()=>[
        {id:'driver-a',name:'Alex',licenseNo:'LIC-PRIVATE-A',licenseCategory:'LMV'},
        {id:'driver-b',name:'Alex',licenseNo:'LIC-PRIVATE-B',licenseCategory:'HMV'}
      ]}
    };
    const result=await executeTool(fakeDb as unknown as PrismaClient,user,'check_assignment',{vehicleQuery:'Van A',driverQuery:'Alex',cargoWeightKg:100});
    expect(result.data).toMatchObject({driverMatches:['Alex (LMV)','Alex (HMV)']});
    expect(JSON.stringify(result.data)).not.toContain('LIC-PRIVATE');
  });

  it('rejects maintenance preparation for a dispatcher before database access',async()=>{
    let queried=false;const fakeDb={vehicle:{findMany:async()=>{queried=true;return[]}}};
    await expect(executeTool(fakeDb as unknown as PrismaClient,user,'prepare_maintenance',{vehicleQuery:null})).rejects.toMatchObject({status:403});
    expect(queried).toBe(false);
  });

  it('scopes maintenance handoffs to the authenticated tenant and keeps ids out of Groq data',async()=>{
    let where:Record<string,unknown>|undefined;const manager={...user,role:Role.FLEET_MANAGER};
    const fakeDb={vehicle:{findMany:async(args:{where:Record<string,unknown>})=>{where=args.where;return[{id:'vehicle-private-id',name:'Van A',registrationNo:'REG-A',status:'AVAILABLE',odometerKm:50000,maintenance:[]}]}}};
    const result=await executeTool(fakeDb as unknown as PrismaClient,manager,'prepare_maintenance',{vehicleQuery:'Van A',organizationId:'tenant-b'});
    expect(where).toMatchObject({organizationId:'tenant-a',status:'AVAILABLE'});
    expect(JSON.stringify(result.data)).not.toContain('vehicle-private-id');
    expect(JSON.stringify(result.evidence)).not.toContain('vehicle-private-id');
    expect(result.handoffs?.[0]).toMatchObject({type:'OPEN_MAINTENANCE_FORM',payload:{vehicleId:'vehicle-private-id',vehicleName:'Van A'}});
  });

  it('does not let finance preparation execute a write and omits ids from model-visible data',async()=>{
    const analyst={...user,role:Role.FINANCIAL_ANALYST};let writes=0;
    const fakeDb={vehicle:{findMany:async()=>[{id:'vehicle-private-id',name:'Truck A',registrationNo:'REG-T',status:'AVAILABLE',odometerKm:70000}]},fuelLog:{create:async()=>{writes+=1}}};
    const result=await executeTool(fakeDb as unknown as PrismaClient,analyst,'prepare_fuel_entry',{vehicleQuery:'Truck A',liters:50,cost:5000,odometerKm:70050});
    expect(writes).toBe(0);
    expect(JSON.stringify(result.data)).not.toContain('vehicle-private-id');
    expect(result.handoffs?.[0]).toMatchObject({type:'OPEN_FUEL_FORM',payload:{vehicleId:'vehicle-private-id',liters:50,cost:5000,odometerKm:70050}});
  });
});
