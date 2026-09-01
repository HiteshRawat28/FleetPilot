import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Prisma, PrismaClient, Role, TripStatus } from '@prisma/client';
import { z } from 'zod';
import { assertAssignmentEligible, AssignmentEligibilityError } from '../services/assignmentEligibility';
import { disclosurePolicyForRole } from './security';

export type CopilotUser={id:string;role:Role;organizationId:string};
export type DraftTripData={source:string;destination:string;vehicleId:string;driverId:string;cargoWeightKg:number;plannedDistanceKm:number;revenue:number};
export type PendingAction={type:'CREATE_DRAFT_TRIP';title:string;summary:string;details:Array<{label:string;value:string}>;confirmationToken:string;idempotencyKey:string;expiresAt:string};
type PreparedDraft={data:unknown;action?:PendingAction;message:string};
type ProposalDetails={source:string;destination:string;cargoWeightKg:number;plannedDistanceKm:number;revenue:number};

const draftInputSchema=z.object({
  source:z.string().trim().min(2).max(120),destination:z.string().trim().min(2).max(120),
  vehicleQuery:z.string().trim().min(1).max(100),driverQuery:z.string().trim().min(1).max(100),
  cargoWeightKg:z.coerce.number().positive(),plannedDistanceKm:z.coerce.number().positive(),revenue:z.coerce.number().nonnegative().default(0)
});
const selectedDraftInputSchema=z.object({
  source:z.string().trim().min(2).max(120),destination:z.string().trim().min(2).max(120),
  vehicleId:z.string().min(1),driverId:z.string().min(1),cargoWeightKg:z.coerce.number().positive(),plannedDistanceKm:z.coerce.number().positive(),revenue:z.coerce.number().nonnegative().default(0)
});

type ActionPayload={v:1;type:'CREATE_DRAFT_TRIP';sub:string;org:string;role:Role;idempotencyKey:string;data:DraftTripData;iat:number;exp:number};
const actionPayloadSchema=z.object({
  v:z.literal(1),type:z.literal('CREATE_DRAFT_TRIP'),sub:z.string().min(1),org:z.string().min(1),role:z.nativeEnum(Role),idempotencyKey:z.uuid(),
  data:z.object({source:z.string().trim().min(2).max(120),destination:z.string().trim().min(2).max(120),vehicleId:z.string().min(1),driverId:z.string().min(1),cargoWeightKg:z.number().positive(),plannedDistanceKm:z.number().positive(),revenue:z.number().nonnegative()}),
  iat:z.number().int().nonnegative(),exp:z.number().int().positive()
});
type Database=PrismaClient|Prisma.TransactionClient;
const encode=(value:string|Buffer)=>Buffer.from(value).toString('base64url');
const decode=(value:string)=>Buffer.from(value,'base64url').toString('utf8');
const actionSecret=()=>process.env.COPILOT_ACTION_SECRET||process.env.JWT_SECRET||'development-only-change-me';

export function signActionPayload(payload:ActionPayload,secret=actionSecret()){
  const body=encode(JSON.stringify(payload));const signature=encode(createHmac('sha256',secret).update(body).digest());return `${body}.${signature}`;
}

export function verifyActionToken(token:string,secret=actionSecret(),now=Date.now()):ActionPayload{
  const [body,provided,...rest]=token.split('.');if(!body||!provided||rest.length)throw Object.assign(new Error('This Copilot confirmation is invalid.'),{status:400});
  const expected=encode(createHmac('sha256',secret).update(body).digest());const a=Buffer.from(provided),b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))throw Object.assign(new Error('This Copilot confirmation is invalid.'),{status:400});
  let decoded:unknown;try{decoded=JSON.parse(decode(body))}catch{throw Object.assign(new Error('This Copilot confirmation is invalid.'),{status:400})}
  const parsed=actionPayloadSchema.safeParse(decoded);if(!parsed.success)throw Object.assign(new Error('This Copilot confirmation is invalid.'),{status:400});const payload=parsed.data as ActionPayload;
  if(payload.exp*1000<=now)throw Object.assign(new Error('This Copilot confirmation has expired. Ask Copilot to prepare it again.'),{status:409});return payload;
}

async function assignmentContext(db:Database,organizationId:string,vehicleId:string,driverId:string){
  const [vehicle,driver,vehicleTrip,driverTrip,maintenance]=await Promise.all([
    db.vehicle.findFirst({where:{id:vehicleId,organizationId}}),db.driver.findFirst({where:{id:driverId,organizationId}}),
    db.trip.findFirst({where:{organizationId,vehicleId,status:TripStatus.DISPATCHED},select:{tripNo:true}}),
    db.trip.findFirst({where:{organizationId,driverId,status:TripStatus.DISPATCHED},select:{tripNo:true}}),
    db.maintenance.findFirst({where:{organizationId,vehicleId,status:'ACTIVE'},select:{serviceType:true}})
  ]);return{vehicle,driver,vehicleTripNo:vehicleTrip?.tripNo,driverTripNo:driverTrip?.tripNo,maintenanceService:maintenance?.serviceType};
}

function requireOrganizationAdmin(user:CopilotUser){if(!new Set<Role>([Role.OWNER,Role.ADMIN]).has(user.role))throw Object.assign(new Error('Only a Company Owner or organization Administrator can create trips through Copilot.'),{status:403})}

async function buildDraftProposal(db:PrismaClient,user:CopilotUser,input:ProposalDetails,vehicle:{id:string;name:string;registrationNo:string},driver:{id:string;name:string}):Promise<PreparedDraft>{
  const context=await assignmentContext(db,user.organizationId,vehicle.id,driver.id);try{assertAssignmentEligible({...context,cargoWeightKg:input.cargoWeightKg})}catch(error){if(error instanceof AssignmentEligibilityError){const explanation=error.reasons.map(reason=>reason.message).join(' ');return{message:`I could not prepare this draft because the assignment has conflicts. ${explanation}`,data:{ready:false,reasons:error.reasons}}}throw error}
  const data:DraftTripData={source:input.source,destination:input.destination,vehicleId:vehicle.id,driverId:driver.id,cargoWeightKg:input.cargoWeightKg,plannedDistanceKm:input.plannedDistanceKm,revenue:input.revenue};const idempotencyKey=randomUUID();const now=Math.floor(Date.now()/1000),exp=now+10*60;const confirmationToken=signActionPayload({v:1,type:'CREATE_DRAFT_TRIP',sub:user.id,org:user.organizationId,role:user.role,idempotencyKey,data,iat:now,exp});
  const action:PendingAction={type:'CREATE_DRAFT_TRIP',title:'Create draft trip',summary:`${input.source} → ${input.destination} with ${vehicle.name} and ${driver.name}`,confirmationToken,idempotencyKey,expiresAt:new Date(exp*1000).toISOString(),details:[{label:'Vehicle',value:`${vehicle.name} · ${vehicle.registrationNo}`},{label:'Driver',value:driver.name},{label:'Cargo',value:`${input.cargoWeightKg.toLocaleString('en-IN')} kg`},{label:'Distance',value:`${input.plannedDistanceKm.toLocaleString('en-IN')} km`},{label:'Revenue',value:`₹${input.revenue.toLocaleString('en-IN')}`} ]};
  return{message:'I have prepared the trip from your selections. Review it and confirm to create the draft.',data:{ready:true,proposal:{source:input.source,destination:input.destination,vehicle:vehicle.name,driver:driver.name,cargoWeightKg:input.cargoWeightKg,plannedDistanceKm:input.plannedDistanceKm,revenue:input.revenue,expiresAt:action.expiresAt}},action};
}

export async function prepareDraftTripAction(db:PrismaClient,user:CopilotUser,raw:unknown):Promise<PreparedDraft>{
  requireOrganizationAdmin(user);
  const input=draftInputSchema.parse(raw);const [vehicles,drivers]=await Promise.all([
    db.vehicle.findMany({where:{organizationId:user.organizationId,OR:[{name:{contains:input.vehicleQuery,mode:'insensitive'}},{registrationNo:{contains:input.vehicleQuery,mode:'insensitive'}}]},take:3}),
    db.driver.findMany({where:{organizationId:user.organizationId,OR:[{name:{contains:input.driverQuery,mode:'insensitive'}},{licenseNo:{contains:input.driverQuery,mode:'insensitive'}}]},take:3})
  ]);
  if(vehicles.length!==1||drivers.length!==1){const showLicence=disclosurePolicyForRole(user.role).driverLicenseNumbers;return{message:'A unique vehicle and driver are required before a draft can be prepared.',data:{ready:false,needsClarification:true,vehicleMatches:vehicles.map(v=>`${v.name} (${v.registrationNo})`),driverMatches:drivers.map(d=>showLicence?`${d.name} (${d.licenseNo})`:`${d.name} (${d.licenseCategory})`)} }};
  return buildDraftProposal(db,user,input,vehicles[0],drivers[0]);
}

export async function prepareSelectedDraftTripAction(db:PrismaClient,user:CopilotUser,raw:unknown):Promise<PreparedDraft>{
  requireOrganizationAdmin(user);const input=selectedDraftInputSchema.parse(raw);const [vehicle,driver]=await Promise.all([
    db.vehicle.findFirst({where:{id:input.vehicleId,organizationId:user.organizationId}}),db.driver.findFirst({where:{id:input.driverId,organizationId:user.organizationId}})
  ]);if(!vehicle||!driver)throw Object.assign(new Error('The selected vehicle or driver is no longer available in this organization.'),{status:404});return buildDraftProposal(db,user,input,vehicle,driver);
}

export async function confirmDraftTripAction(db:PrismaClient,user:CopilotUser,token:string,idempotencyKey:string){
  const payload=verifyActionToken(token);if(payload.sub!==user.id||payload.org!==user.organizationId||payload.role!==user.role||payload.idempotencyKey!==idempotencyKey)throw Object.assign(new Error('This confirmation belongs to a different session or workspace.'),{status:403});
  requireOrganizationAdmin(user);
  return db.$transaction(async tx=>{
    const existing=await tx.copilotAction.findUnique({where:{organizationId_idempotencyKey:{organizationId:user.organizationId,idempotencyKey}},include:{trip:{include:{vehicle:true,driver:true}}}});if(existing?.trip)return{trip:existing.trip,idempotent:true};
    const data=actionPayloadSchema.shape.data.parse(payload.data);const context=await assignmentContext(tx,user.organizationId,data.vehicleId,data.driverId);assertAssignmentEligible({...context,cargoWeightKg:data.cargoWeightKg});
    const tripNo=`TRP${String((await tx.trip.count({where:{organizationId:user.organizationId}}))+1).padStart(4,'0')}`;const trip=await tx.trip.create({data:{...data,tripNo,organizationId:user.organizationId},include:{vehicle:true,driver:true}});
    await tx.copilotAction.create({data:{organizationId:user.organizationId,userId:user.id,type:payload.type,status:'COMPLETED',idempotencyKey,request:payload.data as Prisma.InputJsonValue,result:{tripId:trip.id,tripNo:trip.tripNo},tripId:trip.id}});return{trip,idempotent:false};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
