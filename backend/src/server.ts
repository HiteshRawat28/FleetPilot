import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Prisma, PrismaClient, Role, TripStatus, VehicleStatus, DriverStatus, MaintenanceStatus } from '@prisma/client';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';

const db = new PrismaClient();
const app = express();
const PORT = Number(process.env.PORT || 4000);
const SECRET = process.env.JWT_SECRET || 'development-only-change-me';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map(origin => origin.trim());
app.use(cors({ origin: (origin,callback) => !origin || allowedOrigins.includes(origin) ? callback(null,true) : callback(new Error('Origin is not allowed by CORS')), credentials: true }));
app.use(express.json());

type Session = { id:string; name:string; email:string; role:Role; organizationId:string; organizationName:string };
declare global { namespace Express { interface Request { user?: Session } } }
const asyncRoute = (fn:(req:Request,res:Response,next:NextFunction)=>Promise<unknown>) => (req:Request,res:Response,next:NextFunction) => { Promise.resolve(fn(req,res,next)).catch(next); };
const authenticate = asyncRoute(async (req,res,next) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/,'');
  if (!token) return res.status(401).json({message:'Authentication required'});
  try { const claims=jwt.verify(token,SECRET) as Session;const account=await db.user.findUnique({where:{id:claims.id},include:{organization:true}});if(!account||!account.isActive)return res.status(401).json({message:'This session no longer has access'});req.user=publicUser(account);next(); }
  catch { res.status(401).json({message:'Session expired. Please sign in again.'}); }
});
const elevated = [Role.OWNER,Role.ADMIN];
const allow = (...roles:Role[]) => (req:Request,res:Response,next:NextFunction) => [...elevated,...roles].includes(req.user!.role) ? next() : res.status(403).json({message:'You do not have permission for this action'});
const parse = <T>(schema:z.ZodType<T>, data:unknown) => { const out=schema.safeParse(data); if(!out.success) throw Object.assign(new Error(out.error.issues[0]?.message || 'Invalid request'),{status:400}); return out.data; };
const idParam = (req:Request) => String(req.params.id);
const slugify = (name:string) => name.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,45);
const publicUser = (user:{id:string;name:string;email:string;role:Role;organizationId:string;organization:{name:string}}):Session => ({id:user.id,name:user.name,email:user.email,role:user.role,organizationId:user.organizationId,organizationName:user.organization.name});
const issueSession = (user:Session) => ({token:jwt.sign(user,SECRET,{expiresIn:'8h'}),user});

app.get('/api/health', (_req,res)=>res.json({status:'ok',service:'TransitOps API'}));
app.post('/api/auth/login', asyncRoute(async(req,res)=>{
  const {email,password}=parse(z.object({email:z.email(),password:z.string().min(8)}),req.body);
  const user=await db.user.findUnique({where:{email:email.toLowerCase()},include:{organization:true}});
  if(!user || !user.passwordHash || !(await bcrypt.compare(password,user.passwordHash))) return res.status(401).json({message:'Email or password is incorrect'});
  if(!user.isActive) return res.status(403).json({message:'Your account has been suspended. Contact your company administrator.'});
  await db.user.update({where:{id:user.id},data:{lastLoginAt:new Date()}});
  res.json(issueSession(publicUser(user)));
}));
app.post('/api/auth/register', asyncRoute(async(req,res)=>{
  const {name,email,password,companyName}=parse(z.object({name:z.string().trim().min(2).max(80),email:z.email(),password:z.string().min(10).regex(/[A-Z]/,'Password needs an uppercase letter').regex(/[0-9]/,'Password needs a number'),companyName:z.string().trim().min(2).max(100)}),req.body);
  const normalizedEmail=email.toLowerCase();
  if(await db.user.findUnique({where:{email:normalizedEmail}})) return res.status(409).json({message:'An account already exists for this email'});
  const base=slugify(companyName)||'company'; let slug=base; let suffix=1;
  while(await db.organization.findUnique({where:{slug}})) slug=`${base}-${++suffix}`;
  const user=await db.$transaction(async tx=>{
    const organization=await tx.organization.create({data:{name:companyName,slug,operationsEmail:normalizedEmail}});
    return tx.user.create({data:{name,email:normalizedEmail,passwordHash:await bcrypt.hash(password,12),role:Role.OWNER,organizationId:organization.id,lastLoginAt:new Date()},include:{organization:true}});
  });
  res.status(201).json(issueSession(publicUser(user)));
}));
app.post('/api/auth/google', asyncRoute(async(req,res)=>{
  if(!GOOGLE_CLIENT_ID) return res.status(503).json({message:'Google sign-in is not configured yet'});
  const {credential,intent,companyName}=parse(z.object({credential:z.string().min(20),intent:z.enum(['login','register']),companyName:z.string().trim().min(2).max(100).optional()}),req.body);
  const ticket=await googleClient.verifyIdToken({idToken:credential,audience:GOOGLE_CLIENT_ID}); const payload=ticket.getPayload();
  if(!payload?.sub||!payload.email||!payload.email_verified) return res.status(401).json({message:'Google could not verify this email'});
  const email=payload.email.toLowerCase(); let user=await db.user.findUnique({where:{email},include:{organization:true}});
  if(!user){
    if(intent!=='register'||!companyName) return res.status(404).json({message:'No FleetPilot account found. Create your company workspace first.'});
    const base=slugify(companyName)||'company'; let slug=base; let suffix=1; while(await db.organization.findUnique({where:{slug}}))slug=`${base}-${++suffix}`;
    user=await db.$transaction(async tx=>{const organization=await tx.organization.create({data:{name:companyName,slug,operationsEmail:email}});return tx.user.create({data:{name:payload.name||email.split('@')[0],email,googleSub:payload.sub,role:Role.OWNER,organizationId:organization.id,lastLoginAt:new Date()},include:{organization:true}})});
  } else {
    if(!user.isActive)return res.status(403).json({message:'Your account has been suspended. Contact your company administrator.'});
    if(user.googleSub&&user.googleSub!==payload.sub)return res.status(409).json({message:'This email is linked to another Google identity'});
    user=await db.user.update({where:{id:user.id},data:{googleSub:payload.sub,lastLoginAt:new Date()},include:{organization:true}});
  }
  res.json(issueSession(publicUser(user)));
}));
app.get('/api/auth/me',authenticate,(req,res)=>res.json({user:req.user}));

app.use('/api',authenticate);
app.get('/api/organization',asyncRoute(async(req,res)=>res.json(await db.organization.findUnique({where:{id:req.user!.organizationId}}))));
app.put('/api/organization',allow(Role.OWNER,Role.ADMIN),asyncRoute(async(req,res)=>{const data=parse(z.object({name:z.string().trim().min(2).max(100),operationsEmail:z.email().optional()}),req.body);res.json(await db.organization.update({where:{id:req.user!.organizationId},data}))}));
app.get('/api/users',allow(Role.OWNER,Role.ADMIN),asyncRoute(async(req,res)=>res.json(await db.user.findMany({where:{organizationId:req.user!.organizationId},select:{id:true,name:true,email:true,role:true,isActive:true,lastLoginAt:true,createdAt:true,googleSub:true},orderBy:{createdAt:'asc'}}))));
app.post('/api/users',allow(Role.OWNER,Role.ADMIN),asyncRoute(async(req,res)=>{const {name,email,password,role}=parse(z.object({name:z.string().trim().min(2).max(80),email:z.email(),password:z.string().min(10).regex(/[A-Z]/).regex(/[0-9]/),role:z.enum(Role).refine(r=>r!==Role.OWNER,'Owner access cannot be assigned here')}),req.body);if(req.user!.role===Role.ADMIN&&role===Role.ADMIN)return res.status(403).json({message:'Only the Owner can add another Admin'});const passwordHash=await bcrypt.hash(password,12);res.status(201).json(await db.user.create({data:{name,email:email.toLowerCase(),passwordHash,role,organizationId:req.user!.organizationId},select:{id:true,name:true,email:true,role:true,isActive:true,createdAt:true}}))}));
app.patch('/api/users/:id',allow(Role.OWNER,Role.ADMIN),asyncRoute(async(req,res)=>{const target=await db.user.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId}});if(!target)throw Object.assign(new Error('Team member not found'),{status:404});if(target.role===Role.OWNER)return res.status(403).json({message:'Owner access cannot be changed'});const data=parse(z.object({role:z.enum(Role).refine(r=>r!==Role.OWNER).optional(),isActive:z.boolean().optional(),password:z.string().min(10).regex(/[A-Z]/).regex(/[0-9]/).optional()}),req.body);if(req.user!.role===Role.ADMIN&&(target.role===Role.ADMIN||data.role===Role.ADMIN))return res.status(403).json({message:'Only the Owner can manage Admin access'});res.json(await db.user.update({where:{id:target.id},data:{role:data.role,isActive:data.isActive,...(data.password?{passwordHash:await bcrypt.hash(data.password,12)}:{})},select:{id:true,name:true,email:true,role:true,isActive:true,lastLoginAt:true,createdAt:true,googleSub:true}}))}));
app.get('/api/dashboard',asyncRoute(async(req,res)=>{
  const [vehicles,drivers,trips,recentTrips]=await Promise.all([
    db.vehicle.groupBy({by:['status'],where:{organizationId:req.user!.organizationId},_count:true}),db.driver.groupBy({by:['status'],where:{organizationId:req.user!.organizationId},_count:true}),db.trip.groupBy({by:['status'],where:{organizationId:req.user!.organizationId},_count:true}),
    db.trip.findMany({where:{organizationId:req.user!.organizationId},take:6,orderBy:{createdAt:'desc'},include:{vehicle:true,driver:true}})
  ]);
  const vc=Object.fromEntries(vehicles.map(x=>[x.status,x._count])); const dc=Object.fromEntries(drivers.map(x=>[x.status,x._count])); const tc=Object.fromEntries(trips.map(x=>[x.status,x._count]));
  const active=(vc.AVAILABLE||0)+(vc.ON_TRIP||0)+(vc.IN_SHOP||0); const utilized=vc.ON_TRIP||0;
  res.json({kpis:{activeVehicles:active,availableVehicles:vc.AVAILABLE||0,inMaintenance:vc.IN_SHOP||0,activeTrips:tc.DISPATCHED||0,pendingTrips:tc.DRAFT||0,driversOnDuty:dc.ON_TRIP||0,fleetUtilization:active?Math.round(utilized/active*100):0},vehicleStatus:vc,recentTrips});
}));

const vehicleSchema=z.object({registrationNo:z.string().min(3),name:z.string().min(2),type:z.string().min(2),capacityKg:z.coerce.number().positive(),odometerKm:z.coerce.number().nonnegative(),acquisitionCost:z.coerce.number().nonnegative(),status:z.enum(VehicleStatus).default(VehicleStatus.AVAILABLE),region:z.string().default('Central')});
app.get('/api/vehicles',asyncRoute(async(req,res)=>{
  const q=String(req.query.q||''); const status=req.query.status as VehicleStatus|undefined; const type=String(req.query.type||'');
  res.json(await db.vehicle.findMany({where:{AND:[{organizationId:req.user!.organizationId},q?{OR:[{registrationNo:{contains:q,mode:'insensitive'}},{name:{contains:q,mode:'insensitive'}}]}:{},status?{status}:{},type?{type}:{ }]},orderBy:{createdAt:'desc'}}));
}));
app.get('/api/vehicles/available',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>res.json(await db.vehicle.findMany({where:{organizationId:req.user!.organizationId,status:VehicleStatus.AVAILABLE},orderBy:{name:'asc'}}))));
app.post('/api/vehicles',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>res.status(201).json(await db.vehicle.create({data:{...parse(vehicleSchema,req.body),organizationId:req.user!.organizationId}}))));
app.put('/api/vehicles/:id',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const row=await db.vehicle.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId}});if(!row)throw Object.assign(new Error('Vehicle not found'),{status:404});res.json(await db.vehicle.update({where:{id:row.id},data:parse(vehicleSchema.partial(),req.body)}))}));
app.delete('/api/vehicles/:id',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const row=await db.vehicle.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId}});if(!row)throw Object.assign(new Error('Vehicle not found'),{status:404});await db.vehicle.delete({where:{id:row.id}});res.status(204).end();}));

const driverSchema=z.object({name:z.string().min(2),licenseNo:z.string().min(3),licenseCategory:z.string().min(2),licenseExpiry:z.coerce.date(),contact:z.string().min(7),safetyScore:z.coerce.number().int().min(0).max(100),status:z.enum(DriverStatus).default(DriverStatus.AVAILABLE)});
app.get('/api/drivers',asyncRoute(async(req,res)=>{const q=String(req.query.q||'');res.json(await db.driver.findMany({where:{organizationId:req.user!.organizationId,...(q?{OR:[{name:{contains:q,mode:'insensitive'}},{licenseNo:{contains:q,mode:'insensitive'}}]}:{})},orderBy:{createdAt:'desc'}}));}));
app.get('/api/drivers/available',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>res.json(await db.driver.findMany({where:{organizationId:req.user!.organizationId,status:DriverStatus.AVAILABLE,licenseExpiry:{gt:new Date()}},orderBy:{name:'asc'}}))));
app.post('/api/drivers',allow(Role.FLEET_MANAGER,Role.SAFETY_OFFICER),asyncRoute(async(req,res)=>res.status(201).json(await db.driver.create({data:{...parse(driverSchema,req.body),organizationId:req.user!.organizationId}}))));
app.put('/api/drivers/:id',allow(Role.FLEET_MANAGER,Role.SAFETY_OFFICER),asyncRoute(async(req,res)=>{const row=await db.driver.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId}});if(!row)throw Object.assign(new Error('Driver not found'),{status:404});res.json(await db.driver.update({where:{id:row.id},data:parse(driverSchema.partial(),req.body)}))}));
app.delete('/api/drivers/:id',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const row=await db.driver.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId}});if(!row)throw Object.assign(new Error('Driver not found'),{status:404});await db.driver.delete({where:{id:row.id}});res.status(204).end();}));

const tripSchema=z.object({source:z.string().min(2),destination:z.string().min(2),vehicleId:z.string(),driverId:z.string(),cargoWeightKg:z.coerce.number().positive(),plannedDistanceKm:z.coerce.number().positive(),revenue:z.coerce.number().nonnegative().default(0)});
app.get('/api/trips',asyncRoute(async(req,res)=>res.json(await db.trip.findMany({where:{organizationId:req.user!.organizationId},include:{vehicle:true,driver:true},orderBy:{createdAt:'desc'}}))));
app.post('/api/trips',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{
  const data=parse(tripSchema,req.body); const [v,d]=await Promise.all([db.vehicle.findFirst({where:{id:data.vehicleId,organizationId:req.user!.organizationId}}),db.driver.findFirst({where:{id:data.driverId,organizationId:req.user!.organizationId}})]);
  if(!v||!d) throw Object.assign(new Error('Vehicle or driver not found'),{status:404});
  if(v.status!==VehicleStatus.AVAILABLE) throw Object.assign(new Error('Selected vehicle is not available'),{status:409});
  if(d.status!==DriverStatus.AVAILABLE||d.licenseExpiry<=new Date()) throw Object.assign(new Error('Driver is unavailable, suspended, or license has expired'),{status:409});
  if(data.cargoWeightKg>v.capacityKg) throw Object.assign(new Error(`Cargo exceeds ${v.capacityKg} kg vehicle capacity`),{status:400});
  const tripNo=`TRP${String((await db.trip.count({where:{organizationId:req.user!.organizationId}}))+1).padStart(4,'0')}`;
  res.status(201).json(await db.trip.create({data:{...data,tripNo,organizationId:req.user!.organizationId},include:{vehicle:true,driver:true}}));
}));
app.post('/api/trips/:id/dispatch',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{
  const trip=await db.trip.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId},include:{vehicle:true,driver:true}}); if(!trip) throw Object.assign(new Error('Trip not found'),{status:404});
  if(trip.status!==TripStatus.DRAFT) throw Object.assign(new Error('Only draft trips can be dispatched'),{status:409});
  if(trip.vehicle.status!==VehicleStatus.AVAILABLE||trip.driver.status!==DriverStatus.AVAILABLE||trip.driver.licenseExpiry<=new Date()) throw Object.assign(new Error('Vehicle or driver is no longer eligible'),{status:409});
  const result=await db.$transaction(async tx=>{await tx.vehicle.update({where:{id:trip.vehicleId},data:{status:VehicleStatus.ON_TRIP}});await tx.driver.update({where:{id:trip.driverId},data:{status:DriverStatus.ON_TRIP}});return tx.trip.update({where:{id:trip.id},data:{status:TripStatus.DISPATCHED,dispatchedAt:new Date()},include:{vehicle:true,driver:true}})}); res.json(result);
}));
app.post('/api/trips/:id/complete',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{
  const {finalOdometerKm,fuelConsumedL}=parse(z.object({finalOdometerKm:z.coerce.number().positive(),fuelConsumedL:z.coerce.number().positive()}),req.body); const trip=await db.trip.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId}}); if(!trip||trip.status!==TripStatus.DISPATCHED) throw Object.assign(new Error('Only dispatched trips can be completed'),{status:409});
  const result=await db.$transaction(async tx=>{await tx.vehicle.update({where:{id:trip.vehicleId},data:{status:VehicleStatus.AVAILABLE,odometerKm:finalOdometerKm}});await tx.driver.update({where:{id:trip.driverId},data:{status:DriverStatus.AVAILABLE}});return tx.trip.update({where:{id:trip.id},data:{status:TripStatus.COMPLETED,completedAt:new Date(),finalOdometerKm,fuelConsumedL},include:{vehicle:true,driver:true}})});res.json(result);
}));
app.post('/api/trips/:id/cancel',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const trip=await db.trip.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId}});if(!trip||(trip.status!==TripStatus.DRAFT&&trip.status!==TripStatus.DISPATCHED))throw Object.assign(new Error('Trip cannot be cancelled'),{status:409});const wasLive=trip.status===TripStatus.DISPATCHED;const result=await db.$transaction(async tx=>{if(wasLive){await tx.vehicle.update({where:{id:trip.vehicleId},data:{status:VehicleStatus.AVAILABLE}});await tx.driver.update({where:{id:trip.driverId},data:{status:DriverStatus.AVAILABLE}})}return tx.trip.update({where:{id:trip.id},data:{status:TripStatus.CANCELLED},include:{vehicle:true,driver:true}})});res.json(result);}));

const maintenanceSchema=z.object({vehicleId:z.string(),serviceType:z.string().min(2),description:z.string().optional(),cost:z.coerce.number().nonnegative()});
app.get('/api/maintenance',asyncRoute(async(req,res)=>res.json(await db.maintenance.findMany({where:{organizationId:req.user!.organizationId},include:{vehicle:true},orderBy:{startDate:'desc'}}))));
app.post('/api/maintenance',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const data=parse(maintenanceSchema,req.body);const v=await db.vehicle.findFirst({where:{id:data.vehicleId,organizationId:req.user!.organizationId}});if(!v||v.status!==VehicleStatus.AVAILABLE)throw Object.assign(new Error('Only available vehicles can enter maintenance'),{status:409});const result=await db.$transaction(async tx=>{await tx.vehicle.update({where:{id:v.id},data:{status:VehicleStatus.IN_SHOP}});return tx.maintenance.create({data:{...data,organizationId:req.user!.organizationId},include:{vehicle:true}})});res.status(201).json(result);}));
app.post('/api/maintenance/:id/close',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const m=await db.maintenance.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId},include:{vehicle:true}});if(!m||m.status!==MaintenanceStatus.ACTIVE)throw Object.assign(new Error('Active maintenance record not found'),{status:404});const result=await db.$transaction(async tx=>{if(m.vehicle.status!==VehicleStatus.RETIRED)await tx.vehicle.update({where:{id:m.vehicleId},data:{status:VehicleStatus.AVAILABLE}});return tx.maintenance.update({where:{id:m.id},data:{status:MaintenanceStatus.CLOSED,endDate:new Date()},include:{vehicle:true}})});res.json(result);}));

app.get('/api/finance',asyncRoute(async(req,res)=>{const where={organizationId:req.user!.organizationId};const [fuelLogs,expenses]=await Promise.all([db.fuelLog.findMany({where,include:{vehicle:true},orderBy:{date:'desc'}}),db.expense.findMany({where,include:{vehicle:true},orderBy:{date:'desc'}})]);res.json({fuelLogs,expenses});}));
app.post('/api/fuel',allow(Role.FINANCIAL_ANALYST,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const data=parse(z.object({vehicleId:z.string(),liters:z.coerce.number().positive(),cost:z.coerce.number().positive(),date:z.coerce.date().optional(),odometerKm:z.coerce.number().positive().optional()}),req.body);const vehicle=await db.vehicle.findFirst({where:{id:data.vehicleId,organizationId:req.user!.organizationId}});if(!vehicle)throw Object.assign(new Error('Vehicle not found'),{status:404});res.status(201).json(await db.fuelLog.create({data:{...data,organizationId:req.user!.organizationId},include:{vehicle:true}}));}));
app.post('/api/expenses',allow(Role.FINANCIAL_ANALYST,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const data=parse(z.object({vehicleId:z.string(),type:z.enum(['TOLL','REPAIR','INSURANCE','OTHER']),description:z.string().optional(),amount:z.coerce.number().positive(),date:z.coerce.date().optional()}),req.body);const vehicle=await db.vehicle.findFirst({where:{id:data.vehicleId,organizationId:req.user!.organizationId}});if(!vehicle)throw Object.assign(new Error('Vehicle not found'),{status:404});res.status(201).json(await db.expense.create({data:{...data,organizationId:req.user!.organizationId},include:{vehicle:true}}));}));

async function analytics(organizationId:string){
  const where={organizationId};const [vehicles,fuel,maintenance,expenses,trips]=await Promise.all([db.vehicle.findMany({where}),db.fuelLog.findMany({where}),db.maintenance.findMany({where}),db.expense.findMany({where}),db.trip.findMany({where})]);
  const totalFuel=fuel.reduce((s,x)=>s+x.cost,0), totalMaintenance=maintenance.reduce((s,x)=>s+x.cost,0), totalOther=expenses.reduce((s,x)=>s+x.amount,0), liters=fuel.reduce((s,x)=>s+x.liters,0), distance=trips.filter(x=>x.status===TripStatus.COMPLETED).reduce((s,x)=>s+x.plannedDistanceKm,0), revenue=trips.reduce((s,x)=>s+x.revenue,0), acquisition=vehicles.reduce((s,x)=>s+x.acquisitionCost,0), active=vehicles.filter(x=>x.status!==VehicleStatus.RETIRED).length;
  const byVehicle=vehicles.map(v=>{const vf=fuel.filter(x=>x.vehicleId===v.id).reduce((s,x)=>s+x.cost,0),vm=maintenance.filter(x=>x.vehicleId===v.id).reduce((s,x)=>s+x.cost,0),ve=expenses.filter(x=>x.vehicleId===v.id).reduce((s,x)=>s+x.amount,0),vr=trips.filter(x=>x.vehicleId===v.id).reduce((s,x)=>s+x.revenue,0);return{id:v.id,name:v.name,registrationNo:v.registrationNo,operationalCost:vf+vm+ve,roi:v.acquisitionCost?((vr-vf-vm)/v.acquisitionCost)*100:0}});
  return {summary:{fuelEfficiency:liters?distance/liters:0,fleetUtilization:active?vehicles.filter(x=>x.status===VehicleStatus.ON_TRIP).length/active*100:0,operationalCost:totalFuel+totalMaintenance+totalOther,vehicleRoi:acquisition?(revenue-totalFuel-totalMaintenance)/acquisition*100:0},byVehicle};
}
app.get('/api/analytics',asyncRoute(async(req,res)=>res.json(await analytics(req.user!.organizationId))));
app.get('/api/analytics/export.csv',asyncRoute(async(req,res)=>{const a=await analytics(req.user!.organizationId);const csv=['Vehicle,Registration,Operational Cost,ROI %',...a.byVehicle.map(x=>`"${x.name}","${x.registrationNo}",${x.operationalCost.toFixed(2)},${x.roi.toFixed(2)}`)].join('\n');res.type('text/csv').attachment('fleetpilot-analytics.csv').send(csv);}));

app.use((err:any,_req:Request,res:Response,_next:NextFunction)=>{console.error(err);if(err instanceof Prisma.PrismaClientKnownRequestError&&err.code==='P2002')return res.status(409).json({message:'A record with this unique value already exists'});res.status(err.status||500).json({message:err.message||'Internal server error'});});
app.listen(PORT,()=>console.log(`TransitOps API running at http://localhost:${PORT}`));
process.on('SIGTERM',async()=>{await db.$disconnect();process.exit(0)});
