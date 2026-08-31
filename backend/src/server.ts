import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Prisma, PrismaClient, Role, TripStatus, VehicleStatus, DriverStatus, MaintenanceStatus } from '@prisma/client';
import { z } from 'zod';

const db = new PrismaClient();
const app = express();
const PORT = Number(process.env.PORT || 4000);
const SECRET = process.env.JWT_SECRET || 'development-only-change-me';
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map(origin => origin.trim());
app.use(cors({ origin: (origin,callback) => !origin || allowedOrigins.includes(origin) ? callback(null,true) : callback(new Error('Origin is not allowed by CORS')), credentials: true }));
app.use(express.json());

type Session = { id:string; name:string; email:string; role:Role };
declare global { namespace Express { interface Request { user?: Session } } }
const asyncRoute = (fn:(req:Request,res:Response,next:NextFunction)=>Promise<unknown>) => (req:Request,res:Response,next:NextFunction) => { Promise.resolve(fn(req,res,next)).catch(next); };
const authenticate = asyncRoute(async (req,res,next) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/,'');
  if (!token) return res.status(401).json({message:'Authentication required'});
  try { req.user = jwt.verify(token,SECRET) as Session; next(); }
  catch { res.status(401).json({message:'Session expired. Please sign in again.'}); }
});
const allow = (...roles:Role[]) => (req:Request,res:Response,next:NextFunction) => roles.includes(req.user!.role) ? next() : res.status(403).json({message:'You do not have permission for this action'});
const parse = <T>(schema:z.ZodType<T>, data:unknown) => { const out=schema.safeParse(data); if(!out.success) throw Object.assign(new Error(out.error.issues[0]?.message || 'Invalid request'),{status:400}); return out.data; };
const idParam = (req:Request) => String(req.params.id);

app.get('/api/health', (_req,res)=>res.json({status:'ok',service:'TransitOps API'}));
app.post('/api/auth/login', asyncRoute(async(req,res)=>{
  const {email,password,role}=parse(z.object({email:z.email(),password:z.string().min(6),role:z.enum(Role).optional()}),req.body);
  const user=await db.user.findUnique({where:{email:email.toLowerCase()}});
  if(!user || !(await bcrypt.compare(password,user.passwordHash)) || (role && role!==user.role)) return res.status(401).json({message:'Invalid credentials or role'});
  const session:Session={id:user.id,name:user.name,email:user.email,role:user.role};
  res.json({token:jwt.sign(session,SECRET,{expiresIn:'8h'}),user:session});
}));
app.get('/api/auth/me',authenticate,(req,res)=>res.json({user:req.user}));

app.use('/api',authenticate);
app.get('/api/dashboard',asyncRoute(async(req,res)=>{
  const [vehicles,drivers,trips,recentTrips]=await Promise.all([
    db.vehicle.groupBy({by:['status'],_count:true}),db.driver.groupBy({by:['status'],_count:true}),db.trip.groupBy({by:['status'],_count:true}),
    db.trip.findMany({take:6,orderBy:{createdAt:'desc'},include:{vehicle:true,driver:true}})
  ]);
  const vc=Object.fromEntries(vehicles.map(x=>[x.status,x._count])); const dc=Object.fromEntries(drivers.map(x=>[x.status,x._count])); const tc=Object.fromEntries(trips.map(x=>[x.status,x._count]));
  const active=(vc.AVAILABLE||0)+(vc.ON_TRIP||0)+(vc.IN_SHOP||0); const utilized=vc.ON_TRIP||0;
  res.json({kpis:{activeVehicles:active,availableVehicles:vc.AVAILABLE||0,inMaintenance:vc.IN_SHOP||0,activeTrips:tc.DISPATCHED||0,pendingTrips:tc.DRAFT||0,driversOnDuty:dc.ON_TRIP||0,fleetUtilization:active?Math.round(utilized/active*100):0},vehicleStatus:vc,recentTrips});
}));

const vehicleSchema=z.object({registrationNo:z.string().min(3),name:z.string().min(2),type:z.string().min(2),capacityKg:z.coerce.number().positive(),odometerKm:z.coerce.number().nonnegative(),acquisitionCost:z.coerce.number().nonnegative(),status:z.enum(VehicleStatus).default(VehicleStatus.AVAILABLE),region:z.string().default('Central')});
app.get('/api/vehicles',asyncRoute(async(req,res)=>{
  const q=String(req.query.q||''); const status=req.query.status as VehicleStatus|undefined; const type=String(req.query.type||'');
  res.json(await db.vehicle.findMany({where:{AND:[q?{OR:[{registrationNo:{contains:q,mode:'insensitive'}},{name:{contains:q,mode:'insensitive'}}]}:{},status?{status}:{},type?{type}:{ }]},orderBy:{createdAt:'desc'}}));
}));
app.get('/api/vehicles/available',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(_req,res)=>res.json(await db.vehicle.findMany({where:{status:VehicleStatus.AVAILABLE},orderBy:{name:'asc'}}))));
app.post('/api/vehicles',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>res.status(201).json(await db.vehicle.create({data:parse(vehicleSchema,req.body)}))));
app.put('/api/vehicles/:id',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>res.json(await db.vehicle.update({where:{id:idParam(req)},data:parse(vehicleSchema.partial(),req.body)}))));
app.delete('/api/vehicles/:id',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{await db.vehicle.delete({where:{id:idParam(req)}});res.status(204).end();}));

const driverSchema=z.object({name:z.string().min(2),licenseNo:z.string().min(3),licenseCategory:z.string().min(2),licenseExpiry:z.coerce.date(),contact:z.string().min(7),safetyScore:z.coerce.number().int().min(0).max(100),status:z.enum(DriverStatus).default(DriverStatus.AVAILABLE)});
app.get('/api/drivers',asyncRoute(async(req,res)=>{const q=String(req.query.q||'');res.json(await db.driver.findMany({where:q?{OR:[{name:{contains:q,mode:'insensitive'}},{licenseNo:{contains:q,mode:'insensitive'}}]}:{},orderBy:{createdAt:'desc'}}));}));
app.get('/api/drivers/available',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(_req,res)=>res.json(await db.driver.findMany({where:{status:DriverStatus.AVAILABLE,licenseExpiry:{gt:new Date()}},orderBy:{name:'asc'}}))));
app.post('/api/drivers',allow(Role.FLEET_MANAGER,Role.SAFETY_OFFICER),asyncRoute(async(req,res)=>res.status(201).json(await db.driver.create({data:parse(driverSchema,req.body)}))));
app.put('/api/drivers/:id',allow(Role.FLEET_MANAGER,Role.SAFETY_OFFICER),asyncRoute(async(req,res)=>res.json(await db.driver.update({where:{id:idParam(req)},data:parse(driverSchema.partial(),req.body)}))));
app.delete('/api/drivers/:id',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{await db.driver.delete({where:{id:idParam(req)}});res.status(204).end();}));

const tripSchema=z.object({source:z.string().min(2),destination:z.string().min(2),vehicleId:z.string(),driverId:z.string(),cargoWeightKg:z.coerce.number().positive(),plannedDistanceKm:z.coerce.number().positive(),revenue:z.coerce.number().nonnegative().default(0)});
app.get('/api/trips',asyncRoute(async(_req,res)=>res.json(await db.trip.findMany({include:{vehicle:true,driver:true},orderBy:{createdAt:'desc'}}))));
app.post('/api/trips',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{
  const data=parse(tripSchema,req.body); const [v,d]=await Promise.all([db.vehicle.findUnique({where:{id:data.vehicleId}}),db.driver.findUnique({where:{id:data.driverId}})]);
  if(!v||!d) throw Object.assign(new Error('Vehicle or driver not found'),{status:404});
  if(v.status!==VehicleStatus.AVAILABLE) throw Object.assign(new Error('Selected vehicle is not available'),{status:409});
  if(d.status!==DriverStatus.AVAILABLE||d.licenseExpiry<=new Date()) throw Object.assign(new Error('Driver is unavailable, suspended, or license has expired'),{status:409});
  if(data.cargoWeightKg>v.capacityKg) throw Object.assign(new Error(`Cargo exceeds ${v.capacityKg} kg vehicle capacity`),{status:400});
  const tripNo=`TRP${String((await db.trip.count())+1).padStart(4,'0')}`;
  res.status(201).json(await db.trip.create({data:{...data,tripNo},include:{vehicle:true,driver:true}}));
}));
app.post('/api/trips/:id/dispatch',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{
  const trip=await db.trip.findUnique({where:{id:idParam(req)},include:{vehicle:true,driver:true}}); if(!trip) throw Object.assign(new Error('Trip not found'),{status:404});
  if(trip.status!==TripStatus.DRAFT) throw Object.assign(new Error('Only draft trips can be dispatched'),{status:409});
  if(trip.vehicle.status!==VehicleStatus.AVAILABLE||trip.driver.status!==DriverStatus.AVAILABLE||trip.driver.licenseExpiry<=new Date()) throw Object.assign(new Error('Vehicle or driver is no longer eligible'),{status:409});
  const result=await db.$transaction(async tx=>{await tx.vehicle.update({where:{id:trip.vehicleId},data:{status:VehicleStatus.ON_TRIP}});await tx.driver.update({where:{id:trip.driverId},data:{status:DriverStatus.ON_TRIP}});return tx.trip.update({where:{id:trip.id},data:{status:TripStatus.DISPATCHED,dispatchedAt:new Date()},include:{vehicle:true,driver:true}})}); res.json(result);
}));
app.post('/api/trips/:id/complete',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{
  const {finalOdometerKm,fuelConsumedL}=parse(z.object({finalOdometerKm:z.coerce.number().positive(),fuelConsumedL:z.coerce.number().positive()}),req.body); const trip=await db.trip.findUnique({where:{id:idParam(req)}}); if(!trip||trip.status!==TripStatus.DISPATCHED) throw Object.assign(new Error('Only dispatched trips can be completed'),{status:409});
  const result=await db.$transaction(async tx=>{await tx.vehicle.update({where:{id:trip.vehicleId},data:{status:VehicleStatus.AVAILABLE,odometerKm:finalOdometerKm}});await tx.driver.update({where:{id:trip.driverId},data:{status:DriverStatus.AVAILABLE}});return tx.trip.update({where:{id:trip.id},data:{status:TripStatus.COMPLETED,completedAt:new Date(),finalOdometerKm,fuelConsumedL},include:{vehicle:true,driver:true}})});res.json(result);
}));
app.post('/api/trips/:id/cancel',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const trip=await db.trip.findUnique({where:{id:idParam(req)}});if(!trip||(trip.status!==TripStatus.DRAFT&&trip.status!==TripStatus.DISPATCHED))throw Object.assign(new Error('Trip cannot be cancelled'),{status:409});const wasLive=trip.status===TripStatus.DISPATCHED;const result=await db.$transaction(async tx=>{if(wasLive){await tx.vehicle.update({where:{id:trip.vehicleId},data:{status:VehicleStatus.AVAILABLE}});await tx.driver.update({where:{id:trip.driverId},data:{status:DriverStatus.AVAILABLE}})}return tx.trip.update({where:{id:trip.id},data:{status:TripStatus.CANCELLED},include:{vehicle:true,driver:true}})});res.json(result);}));

const maintenanceSchema=z.object({vehicleId:z.string(),serviceType:z.string().min(2),description:z.string().optional(),cost:z.coerce.number().nonnegative()});
app.get('/api/maintenance',asyncRoute(async(_req,res)=>res.json(await db.maintenance.findMany({include:{vehicle:true},orderBy:{startDate:'desc'}}))));
app.post('/api/maintenance',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const data=parse(maintenanceSchema,req.body);const v=await db.vehicle.findUnique({where:{id:data.vehicleId}});if(!v||v.status!==VehicleStatus.AVAILABLE)throw Object.assign(new Error('Only available vehicles can enter maintenance'),{status:409});const result=await db.$transaction(async tx=>{await tx.vehicle.update({where:{id:v.id},data:{status:VehicleStatus.IN_SHOP}});return tx.maintenance.create({data,include:{vehicle:true}})});res.status(201).json(result);}));
app.post('/api/maintenance/:id/close',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const m=await db.maintenance.findUnique({where:{id:idParam(req)},include:{vehicle:true}});if(!m||m.status!==MaintenanceStatus.ACTIVE)throw Object.assign(new Error('Active maintenance record not found'),{status:404});const result=await db.$transaction(async tx=>{if(m.vehicle.status!==VehicleStatus.RETIRED)await tx.vehicle.update({where:{id:m.vehicleId},data:{status:VehicleStatus.AVAILABLE}});return tx.maintenance.update({where:{id:m.id},data:{status:MaintenanceStatus.CLOSED,endDate:new Date()},include:{vehicle:true}})});res.json(result);}));

app.get('/api/finance',asyncRoute(async(_req,res)=>{const [fuelLogs,expenses]=await Promise.all([db.fuelLog.findMany({include:{vehicle:true},orderBy:{date:'desc'}}),db.expense.findMany({include:{vehicle:true},orderBy:{date:'desc'}})]);res.json({fuelLogs,expenses});}));
app.post('/api/fuel',allow(Role.FINANCIAL_ANALYST,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const data=parse(z.object({vehicleId:z.string(),liters:z.coerce.number().positive(),cost:z.coerce.number().positive(),date:z.coerce.date().optional(),odometerKm:z.coerce.number().positive().optional()}),req.body);res.status(201).json(await db.fuelLog.create({data,include:{vehicle:true}}));}));
app.post('/api/expenses',allow(Role.FINANCIAL_ANALYST,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const data=parse(z.object({vehicleId:z.string(),type:z.enum(['TOLL','REPAIR','INSURANCE','OTHER']),description:z.string().optional(),amount:z.coerce.number().positive(),date:z.coerce.date().optional()}),req.body);res.status(201).json(await db.expense.create({data,include:{vehicle:true}}));}));

async function analytics(){
  const [vehicles,fuel,maintenance,expenses,trips]=await Promise.all([db.vehicle.findMany(),db.fuelLog.findMany(),db.maintenance.findMany(),db.expense.findMany(),db.trip.findMany()]);
  const totalFuel=fuel.reduce((s,x)=>s+x.cost,0), totalMaintenance=maintenance.reduce((s,x)=>s+x.cost,0), totalOther=expenses.reduce((s,x)=>s+x.amount,0), liters=fuel.reduce((s,x)=>s+x.liters,0), distance=trips.filter(x=>x.status===TripStatus.COMPLETED).reduce((s,x)=>s+x.plannedDistanceKm,0), revenue=trips.reduce((s,x)=>s+x.revenue,0), acquisition=vehicles.reduce((s,x)=>s+x.acquisitionCost,0), active=vehicles.filter(x=>x.status!==VehicleStatus.RETIRED).length;
  const byVehicle=vehicles.map(v=>{const vf=fuel.filter(x=>x.vehicleId===v.id).reduce((s,x)=>s+x.cost,0),vm=maintenance.filter(x=>x.vehicleId===v.id).reduce((s,x)=>s+x.cost,0),ve=expenses.filter(x=>x.vehicleId===v.id).reduce((s,x)=>s+x.amount,0),vr=trips.filter(x=>x.vehicleId===v.id).reduce((s,x)=>s+x.revenue,0);return{id:v.id,name:v.name,registrationNo:v.registrationNo,operationalCost:vf+vm+ve,roi:v.acquisitionCost?((vr-vf-vm)/v.acquisitionCost)*100:0}});
  return {summary:{fuelEfficiency:liters?distance/liters:0,fleetUtilization:active?vehicles.filter(x=>x.status===VehicleStatus.ON_TRIP).length/active*100:0,operationalCost:totalFuel+totalMaintenance+totalOther,vehicleRoi:acquisition?(revenue-totalFuel-totalMaintenance)/acquisition*100:0},byVehicle};
}
app.get('/api/analytics',asyncRoute(async(_req,res)=>res.json(await analytics())));
app.get('/api/analytics/export.csv',asyncRoute(async(_req,res)=>{const a=await analytics();const csv=['Vehicle,Registration,Operational Cost,ROI %',...a.byVehicle.map(x=>`"${x.name}","${x.registrationNo}",${x.operationalCost.toFixed(2)},${x.roi.toFixed(2)}`)].join('\n');res.type('text/csv').attachment('transitops-analytics.csv').send(csv);}));

app.use((err:any,_req:Request,res:Response,_next:NextFunction)=>{console.error(err);if(err instanceof Prisma.PrismaClientKnownRequestError&&err.code==='P2002')return res.status(409).json({message:'A record with this unique value already exists'});res.status(err.status||500).json({message:err.message||'Internal server error'});});
app.listen(PORT,()=>console.log(`TransitOps API running at http://localhost:${PORT}`));
process.on('SIGTERM',async()=>{await db.$disconnect();process.exit(0)});
