import { describe,expect,it } from 'vitest';
import { Role } from '@prisma/client';
import { prepareSelectedDraftTripAction,signActionPayload,verifyActionToken } from './actions';
import type { PrismaClient } from '@prisma/client';

const payload={v:1 as const,type:'CREATE_DRAFT_TRIP' as const,sub:'user-1',org:'org-1',role:Role.DISPATCHER,idempotencyKey:'c6e17b33-0db1-41f1-a067-f4b918c20db4',data:{source:'Delhi',destination:'Jaipur',vehicleId:'vehicle-1',driverId:'driver-1',cargoWeightKg:1200,plannedDistanceKm:280,revenue:18000},iat:1_000,exp:2_000};

describe('Copilot action confirmation tokens',()=>{
  it('round-trips a signed action payload',()=>expect(verifyActionToken(signActionPayload(payload,'secret'),'secret',1_500_000)).toEqual(payload));
  it('rejects a tampered token',()=>expect(()=>verifyActionToken(`${signActionPayload(payload,'secret')}x`,'secret',1_500_000)).toThrow('invalid'));
  it('rejects a signed but malformed payload',()=>expect(()=>verifyActionToken(signActionPayload({...payload,exp:undefined} as never,'secret'),'secret',1_500_000)).toThrow('invalid'));
  it('rejects an expired token',()=>expect(()=>verifyActionToken(signActionPayload(payload,'secret'),'secret',2_001_000)).toThrow('expired'));
  it('rejects guided preparation before database access for every non-admin role',async()=>{
    await expect(prepareSelectedDraftTripAction({} as PrismaClient,{id:'dispatcher-1',organizationId:'org-1',role:Role.DISPATCHER},{source:'Delhi',destination:'Jaipur',vehicleId:'vehicle-1',driverId:'driver-1',cargoWeightKg:1200,plannedDistanceKm:280,revenue:18000})).rejects.toMatchObject({status:403});
  });
  it('prepares a confirmation card for an eligible organization administrator selection',async()=>{
    const vehicle={id:'vehicle-1',name:'Admin Truck',registrationNo:'ADMIN-TRUCK-1',status:'AVAILABLE',capacityKg:3000,requiredLicenseCategory:'HMV'};
    const driver={id:'driver-1',name:'Admin Driver',status:'AVAILABLE',licenseNo:'ADMIN-LIC-1',licenseCategory:'HMV',licenseExpiry:new Date(Date.now()+86_400_000)};
    const organizations:string[]=[];const fakeDb={
      vehicle:{findFirst:async({where}:{where:{organizationId:string}})=>{organizations.push(where.organizationId);return vehicle}},
      driver:{findFirst:async({where}:{where:{organizationId:string}})=>{organizations.push(where.organizationId);return driver}},
      trip:{findFirst:async()=>null},maintenance:{findFirst:async()=>null}
    };
    const result=await prepareSelectedDraftTripAction(fakeDb as unknown as PrismaClient,{id:'admin-1',organizationId:'org-1',role:Role.ADMIN},{source:'Delhi',destination:'Jaipur',vehicleId:'vehicle-1',driverId:'driver-1',cargoWeightKg:1200,plannedDistanceKm:280,revenue:18000});
    expect(organizations.every(value=>value==='org-1')).toBe(true);
    expect(result.action?.summary).toContain('Admin Truck and Admin Driver');
    expect(result.action?.confirmationToken).toBeTruthy();
  });
});
