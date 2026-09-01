import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { DriverDocumentType, DriverOnboardingStatus, ExpenseType, Prisma, PrismaClient, RecordSource, Role, TripEvidenceType, TripStatus, VehicleStatus, DriverStatus, MaintenanceStatus } from '@prisma/client';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { estimateRoutes, searchPlaces } from './constants/routePlanning';
import { objectStorageConfigured, signedObjectUrl, uploadPrivateObject } from './services/objectStorage';
import { extractDrivingLicense, extractOdometer, extractReceipt } from './services/ocr';

const db = new PrismaClient();
const app = express();
const PORT = Number(process.env.PORT || 4000);
const SECRET = process.env.JWT_SECRET || 'development-only-change-me';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map(origin => origin.trim());
app.use(cors({ origin: (origin,callback) => !origin || allowedOrigins.includes(origin) ? callback(null,true) : callback(new Error('Origin is not allowed by CORS')), credentials: true }));
app.use(express.json());

type Session = { id:string; name:string; email:string; role:Role; organizationId:string; organizationName:string; driverId?:string; onboardingStatus?:DriverOnboardingStatus; mustChangePassword:boolean };
declare global { namespace Express { interface Request { user?: Session } } }
const asyncRoute = (fn:(req:Request,res:Response,next:NextFunction)=>Promise<unknown>) => (req:Request,res:Response,next:NextFunction) => { Promise.resolve(fn(req,res,next)).catch(next); };
const authenticate = asyncRoute(async (req,res,next) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/,'');
  if (!token) return res.status(401).json({message:'Authentication required'});
  try { const claims=jwt.verify(token,SECRET) as Session;const account=await db.user.findUnique({where:{id:claims.id},include:{organization:true,driverProfile:true}});if(!account||!account.isActive)return res.status(401).json({message:'This session no longer has access'});await db.user.update({where:{id:account.id},data:{lastActiveAt:new Date()}});req.user=publicUser(account);next(); }
  catch { res.status(401).json({message:'Session expired. Please sign in again.'}); }
});
const elevated = [Role.OWNER,Role.ADMIN];
const allow = (...roles:Role[]) => (req:Request,res:Response,next:NextFunction) => [...elevated,...roles].includes(req.user!.role) ? next() : res.status(403).json({message:'You do not have permission for this action'});
const parse = <T>(schema:z.ZodType<T>, data:unknown) => { const out=schema.safeParse(data); if(!out.success) throw Object.assign(new Error(out.error.issues[0]?.message || 'Invalid request'),{status:400}); return out.data; };
const idParam = (req:Request) => String(req.params.id);
const slugify = (name:string) => name.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,45);
const publicUser = (user:{id:string;name:string;email:string;role:Role;organizationId:string;organization:{name:string};mustChangePassword:boolean;driverProfile?:{id:string;onboardingStatus:DriverOnboardingStatus}|null}):Session => ({id:user.id,name:user.name,email:user.email,role:user.role,organizationId:user.organizationId,organizationName:user.organization.name,mustChangePassword:user.mustChangePassword,...(user.driverProfile?{driverId:user.driverProfile.id,onboardingStatus:user.driverProfile.onboardingStatus}:{})});
const issueSession = (user:Session) => ({token:jwt.sign(user,SECRET,{expiresIn:'8h'}),user});
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:3},fileFilter:(_req,file,callback)=>/^image\/(jpeg|png|webp|heic|heif)$/.test(file.mimetype)?callback(null,true):callback(Object.assign(new Error('Only JPEG, PNG, WebP, or HEIC images are allowed'),{status:400}))});
const normalizeRegistration=(value:string)=>value.toUpperCase().replace(/[^A-Z0-9]/g,'');
const signedPrivateUrl=(objectKey:string|null|undefined)=>objectKey&&objectStorageConfigured()?signedObjectUrl(objectKey):Promise.resolve(null);
const optionalPositiveNumber=z.preprocess(value=>value===''||value===null||value===undefined?undefined:value,z.coerce.number().positive().optional());
const optionalNonnegativeNumber=z.preprocess(value=>value===''||value===null||value===undefined?undefined:value,z.coerce.number().nonnegative().optional());

app.get('/api/health', (_req,res)=>res.json({status:'ok',service:'TransitOps API'}));
app.post('/api/auth/login', asyncRoute(async(req,res)=>{
  const {email,password}=parse(z.object({email:z.email(),password:z.string().min(8)}),req.body);
  const user=await db.user.findUnique({where:{email:email.toLowerCase()},include:{organization:true,driverProfile:true}});
  if(!user || !user.passwordHash || !(await bcrypt.compare(password,user.passwordHash))) return res.status(401).json({message:'Email or password is incorrect'});
  if(!user.isActive) return res.status(403).json({message:'Your account has been suspended. Contact your company administrator.'});
  await db.user.update({where:{id:user.id},data:{lastLoginAt:new Date(),lastActiveAt:new Date()}});
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
    return tx.user.create({data:{name,email:normalizedEmail,passwordHash:await bcrypt.hash(password,12),role:Role.OWNER,organizationId:organization.id,lastLoginAt:new Date(),lastActiveAt:new Date()},include:{organization:true}});
  });
  res.status(201).json(issueSession(publicUser(user)));
}));
app.post('/api/auth/google', asyncRoute(async(req,res)=>{
  if(!GOOGLE_CLIENT_ID) return res.status(503).json({message:'Google sign-in is not configured yet'});
  const {credential,intent,companyName}=parse(z.object({credential:z.string().min(20),intent:z.enum(['login','register']),companyName:z.string().trim().min(2).max(100).optional()}),req.body);
  const ticket=await googleClient.verifyIdToken({idToken:credential,audience:GOOGLE_CLIENT_ID}); const payload=ticket.getPayload();
  if(!payload?.sub||!payload.email||!payload.email_verified) return res.status(401).json({message:'Google could not verify this email'});
  const email=payload.email.toLowerCase(); let user=await db.user.findUnique({where:{email},include:{organization:true,driverProfile:true}});
  if(!user){
    if(intent!=='register'||!companyName) return res.status(404).json({message:'No FleetPilot account found. Create your company workspace first.'});
    const base=slugify(companyName)||'company'; let slug=base; let suffix=1; while(await db.organization.findUnique({where:{slug}}))slug=`${base}-${++suffix}`;
    user=await db.$transaction(async tx=>{const organization=await tx.organization.create({data:{name:companyName,slug,operationsEmail:email}});return tx.user.create({data:{name:payload.name||email.split('@')[0],email,googleSub:payload.sub,role:Role.OWNER,organizationId:organization.id,lastLoginAt:new Date(),lastActiveAt:new Date()},include:{organization:true,driverProfile:true}})});
  } else {
    if(!user.isActive)return res.status(403).json({message:'Your account has been suspended. Contact your company administrator.'});
    if(user.googleSub&&user.googleSub!==payload.sub)return res.status(409).json({message:'This email is linked to another Google identity'});
    user=await db.user.update({where:{id:user.id},data:{googleSub:payload.sub,lastLoginAt:new Date(),lastActiveAt:new Date()},include:{organization:true,driverProfile:true}});
  }
  res.json(issueSession(publicUser(user)));
}));
app.get('/api/auth/me',authenticate,(req,res)=>res.json({user:req.user}));

app.post('/api/driver/auth/register',asyncRoute(async(req,res)=>{
  return res.status(410).json({message:'Driver self-registration is disabled. Ask your company Owner, Administrator, or Fleet Manager to create your access.'});
  /* Legacy implementation retained temporarily for data-migration reference.
  const {companyCode,name,contact,email,password}=parse(z.object({companyCode:z.string().trim().min(2).max(60),name:z.string().trim().min(2).max(80),contact:z.string().trim().min(7).max(20),email:z.email(),password:z.string().min(10).regex(/[A-Z]/,'Password needs an uppercase letter').regex(/[0-9]/,'Password needs a number')}),req.body);
  const organization=await db.organization.findFirst({where:{OR:[{slug:companyCode.toLowerCase()},{name:{equals:companyCode,mode:'insensitive'}}]}});
  if(!organization)return res.status(404).json({message:'Company workspace not found'});
  const normalizedEmail=email.toLowerCase();if(await db.user.findUnique({where:{email:normalizedEmail}}))return res.status(409).json({message:'An account already exists for this email'});
  const user=await db.$transaction(async tx=>{
    const account=await tx.user.create({data:{name,email:normalizedEmail,passwordHash:await bcrypt.hash(password,12),role:Role.DRIVER,organizationId:organization.id,lastLoginAt:new Date(),lastActiveAt:new Date()}});
    await tx.driver.create({data:{name,contact,licenseNo:`PENDING-${account.id}`,licenseCategory:'PENDING',licenseExpiry:new Date(),status:DriverStatus.OFF_DUTY,onboardingStatus:DriverOnboardingStatus.PENDING,userId:account.id,organizationId:organization.id}});
    return tx.user.findUniqueOrThrow({where:{id:account.id},include:{organization:true,driverProfile:true}});
  });
  res.status(201).json(issueSession(publicUser(user)));
  */
}));

app.use('/api',authenticate);
app.post('/api/auth/change-password',asyncRoute(async(req,res)=>{const {currentPassword,newPassword}=parse(z.object({currentPassword:z.string().min(8),newPassword:z.string().min(10).regex(/[A-Z]/,'Password needs an uppercase letter').regex(/[0-9]/,'Password needs a number')}),req.body);const account=await db.user.findUnique({where:{id:req.user!.id}});if(!account?.passwordHash||!(await bcrypt.compare(currentPassword,account.passwordHash)))return res.status(401).json({message:'Current password is incorrect'});await db.user.update({where:{id:account.id},data:{passwordHash:await bcrypt.hash(newPassword,12),mustChangePassword:false}});res.json({message:'Password changed successfully'})}));
app.get('/api/organization',allow(Role.FLEET_MANAGER,Role.DISPATCHER,Role.SAFETY_OFFICER,Role.FINANCIAL_ANALYST),asyncRoute(async(req,res)=>res.json(await db.organization.findUnique({where:{id:req.user!.organizationId}}))));
app.put('/api/organization',allow(Role.OWNER,Role.ADMIN),asyncRoute(async(req,res)=>{const data=parse(z.object({name:z.string().trim().min(2).max(100),operationsEmail:z.email().optional()}),req.body);res.json(await db.organization.update({where:{id:req.user!.organizationId},data}))}));
app.get('/api/users',allow(Role.OWNER,Role.ADMIN,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>res.json(await db.user.findMany({where:{organizationId:req.user!.organizationId,...(req.user!.role===Role.FLEET_MANAGER?{role:Role.DRIVER}:{})},select:{id:true,name:true,email:true,role:true,isActive:true,mustChangePassword:true,lastLoginAt:true,lastActiveAt:true,createdAt:true,googleSub:true,driverProfile:{select:{id:true,onboardingStatus:true,status:true}}},orderBy:{createdAt:'asc'}}))));
app.post('/api/users',allow(Role.OWNER,Role.ADMIN,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{
  const {name,email,password,role,contact}=parse(z.object({name:z.string().trim().min(2).max(80),email:z.email(),password:z.string().min(10).regex(/[A-Z]/).regex(/[0-9]/),role:z.enum(Role).refine(r=>r!==Role.OWNER,'Owner access cannot be assigned here'),contact:z.string().trim().min(7).max(20).optional()}),req.body);
  if(req.user!.role===Role.FLEET_MANAGER&&role!==Role.DRIVER)return res.status(403).json({message:'Fleet Managers can create driver access only'});
  if(req.user!.role===Role.ADMIN&&role===Role.ADMIN)return res.status(403).json({message:'Only the Owner can add another Admin'});
  if(role===Role.DRIVER&&!contact)return res.status(400).json({message:'A contact number is required for driver access'});
  const normalizedEmail=email.toLowerCase();if(await db.user.findUnique({where:{email:normalizedEmail}}))return res.status(409).json({message:'An account already exists for this email'});
  const account=await db.$transaction(async tx=>{const user=await tx.user.create({data:{name,email:normalizedEmail,passwordHash:await bcrypt.hash(password,12),role,organizationId:req.user!.organizationId,mustChangePassword:true}});if(role===Role.DRIVER)await tx.driver.create({data:{name,contact:contact!,licenseNo:`PENDING-${user.id}`,licenseCategory:'PENDING',licenseExpiry:new Date(),status:DriverStatus.OFF_DUTY,onboardingStatus:DriverOnboardingStatus.PENDING,userId:user.id,organizationId:req.user!.organizationId}});return tx.user.findUniqueOrThrow({where:{id:user.id},select:{id:true,name:true,email:true,role:true,isActive:true,mustChangePassword:true,createdAt:true,driverProfile:{select:{id:true,onboardingStatus:true,status:true}}}})});
  res.status(201).json(account);
}));
app.patch('/api/users/:id',allow(Role.OWNER,Role.ADMIN,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const target=await db.user.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId}});if(!target)throw Object.assign(new Error('Team member not found'),{status:404});if(target.role===Role.OWNER)return res.status(403).json({message:'Owner access cannot be changed'});const data=parse(z.object({role:z.enum(Role).refine(r=>r!==Role.OWNER&&r!==Role.DRIVER,'Driver roles are managed through Driver Access').optional(),isActive:z.boolean().optional(),password:z.string().min(10).regex(/[A-Z]/).regex(/[0-9]/).optional()}),req.body);if(req.user!.role===Role.FLEET_MANAGER&&target.role!==Role.DRIVER)return res.status(403).json({message:'Fleet Managers can manage driver access only'});if(target.role===Role.DRIVER&&data.role)return res.status(409).json({message:'A linked Driver role cannot be changed'});if(req.user!.role===Role.ADMIN&&(target.role===Role.ADMIN||data.role===Role.ADMIN))return res.status(403).json({message:'Only the Owner can manage Admin access'});res.json(await db.user.update({where:{id:target.id},data:{role:data.role,isActive:data.isActive,...(data.password?{passwordHash:await bcrypt.hash(data.password,12),mustChangePassword:true}:{})},select:{id:true,name:true,email:true,role:true,isActive:true,mustChangePassword:true,lastLoginAt:true,lastActiveAt:true,createdAt:true,googleSub:true,driverProfile:{select:{id:true,onboardingStatus:true,status:true}}}}))}));
app.get('/api/dashboard',allow(Role.FLEET_MANAGER,Role.DISPATCHER,Role.SAFETY_OFFICER,Role.FINANCIAL_ANALYST),asyncRoute(async(req,res)=>{
  const [vehicles,drivers,trips,recentTrips]=await Promise.all([
    db.vehicle.groupBy({by:['status'],where:{organizationId:req.user!.organizationId},_count:true}),db.driver.groupBy({by:['status'],where:{organizationId:req.user!.organizationId},_count:true}),db.trip.groupBy({by:['status'],where:{organizationId:req.user!.organizationId},_count:true}),
    db.trip.findMany({where:{organizationId:req.user!.organizationId},take:6,orderBy:{createdAt:'desc'},include:{vehicle:true,driver:true}})
  ]);
  const vc=Object.fromEntries(vehicles.map(x=>[x.status,x._count])); const dc=Object.fromEntries(drivers.map(x=>[x.status,x._count])); const tc=Object.fromEntries(trips.map(x=>[x.status,x._count]));
  const active=(vc.AVAILABLE||0)+(vc.ON_TRIP||0)+(vc.IN_SHOP||0); const utilized=vc.ON_TRIP||0;
  res.json({kpis:{activeVehicles:active,availableVehicles:vc.AVAILABLE||0,inMaintenance:vc.IN_SHOP||0,activeTrips:(tc.DISPATCHED||0)+(tc.IN_PROGRESS||0),pendingTrips:tc.DRAFT||0,driversOnDuty:dc.ON_TRIP||0,fleetUtilization:active?Math.round(utilized/active*100):0},vehicleStatus:vc,recentTrips});
}));

const vehicleSchema=z.object({registrationNo:z.string().min(3),name:z.string().min(2),type:z.string().min(2),capacityKg:z.coerce.number().positive(),odometerKm:z.coerce.number().nonnegative(),acquisitionCost:z.coerce.number().nonnegative(),status:z.enum(VehicleStatus).default(VehicleStatus.AVAILABLE),region:z.string().default('Central')});
app.get('/api/vehicles',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{
  const q=String(req.query.q||''); const status=req.query.status as VehicleStatus|undefined; const type=String(req.query.type||'');
  res.json(await db.vehicle.findMany({where:{AND:[{organizationId:req.user!.organizationId},q?{OR:[{registrationNo:{contains:q,mode:'insensitive'}},{name:{contains:q,mode:'insensitive'}}]}:{},status?{status}:{},type?{type}:{ }]},orderBy:{createdAt:'desc'}}));
}));
app.get('/api/vehicles/available',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>res.json(await db.vehicle.findMany({where:{organizationId:req.user!.organizationId,status:VehicleStatus.AVAILABLE},orderBy:{name:'asc'}}))));
app.post('/api/vehicles',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>res.status(201).json(await db.vehicle.create({data:{...parse(vehicleSchema,req.body),organizationId:req.user!.organizationId}}))));
app.put('/api/vehicles/:id',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const row=await db.vehicle.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId}});if(!row)throw Object.assign(new Error('Vehicle not found'),{status:404});res.json(await db.vehicle.update({where:{id:row.id},data:parse(vehicleSchema.partial(),req.body)}))}));
app.delete('/api/vehicles/:id',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const row=await db.vehicle.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId}});if(!row)throw Object.assign(new Error('Vehicle not found'),{status:404});await db.vehicle.delete({where:{id:row.id}});res.status(204).end();}));

const driverSchema=z.object({name:z.string().min(2),licenseNo:z.string().min(3),licenseCategory:z.string().min(2),licenseExpiry:z.coerce.date(),contact:z.string().min(7),safetyScore:z.coerce.number().int().min(0).max(100),status:z.enum(DriverStatus).default(DriverStatus.AVAILABLE)});
app.get('/api/drivers',allow(Role.FLEET_MANAGER,Role.SAFETY_OFFICER),asyncRoute(async(req,res)=>{const q=String(req.query.q||'');res.json(await db.driver.findMany({where:{organizationId:req.user!.organizationId,...(q?{OR:[{name:{contains:q,mode:'insensitive'}},{licenseNo:{contains:q,mode:'insensitive'}}]}:{})},include:{user:{select:{email:true,isActive:true}},_count:{select:{documents:true,trips:true}}},orderBy:{createdAt:'desc'}}));}));
app.get('/api/drivers/available',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>res.json(await db.driver.findMany({where:{organizationId:req.user!.organizationId,status:DriverStatus.AVAILABLE,licenseExpiry:{gt:new Date()}},orderBy:{name:'asc'}}))));
app.get('/api/drivers/:id',allow(Role.FLEET_MANAGER,Role.SAFETY_OFFICER,Role.DISPATCHER),asyncRoute(async(req,res)=>{
  const driver=await db.driver.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId},include:{user:{select:{email:true,isActive:true,lastLoginAt:true}},documents:{orderBy:{createdAt:'desc'}},trips:{include:{vehicle:true},orderBy:{createdAt:'desc'},take:10}}});
  if(!driver)throw Object.assign(new Error('Driver not found'),{status:404});
  const documents=await Promise.all(driver.documents.map(async document=>({...document,objectKey:undefined,url:objectStorageConfigured()?await signedObjectUrl(document.objectKey):null})));
  res.json({...driver,documents});
}));
app.post('/api/drivers/:id/approve',allow(Role.FLEET_MANAGER,Role.SAFETY_OFFICER),asyncRoute(async(req,res)=>{
  const driver=await db.driver.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId},include:{documents:true,user:true}});if(!driver)throw Object.assign(new Error('Driver not found'),{status:404});
  if(!driver.userId)throw Object.assign(new Error('Only a linked driver account can use digital approval'),{status:409});
  if(driver.onboardingStatus!==DriverOnboardingStatus.NEEDS_REVIEW)throw Object.assign(new Error('This driver has not submitted onboarding for review'),{status:409});
  const uploaded=new Set(driver.documents.map(document=>document.type));if(!uploaded.has(DriverDocumentType.PROFILE_PHOTO)||!uploaded.has(DriverDocumentType.LICENSE_FRONT))throw Object.assign(new Error('Profile photo and licence front are required before approval'),{status:409});
  if(driver.licenseNo.startsWith('PENDING-')||driver.licenseExpiry<=new Date())throw Object.assign(new Error('Confirm a valid, unexpired driving licence before approval'),{status:409});
  res.json(await db.driver.update({where:{id:driver.id},data:{onboardingStatus:DriverOnboardingStatus.VERIFIED,status:DriverStatus.AVAILABLE,verifiedAt:new Date(),reviewedAt:new Date(),reviewedById:req.user!.id,reviewNote:null},include:{user:{select:{email:true,isActive:true,lastLoginAt:true}},documents:true}}));
}));
app.post('/api/drivers/:id/reject',allow(Role.FLEET_MANAGER,Role.SAFETY_OFFICER),asyncRoute(async(req,res)=>{
  const {reviewNote}=parse(z.object({reviewNote:z.string().trim().min(10).max(500)}),req.body);const driver=await db.driver.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId,userId:{not:null}}});if(!driver)throw Object.assign(new Error('Linked driver not found'),{status:404});
  if(driver.onboardingStatus!==DriverOnboardingStatus.NEEDS_REVIEW)throw Object.assign(new Error('Only a submitted onboarding can be rejected'),{status:409});
  res.json(await db.driver.update({where:{id:driver.id},data:{onboardingStatus:DriverOnboardingStatus.REJECTED,status:DriverStatus.OFF_DUTY,verifiedAt:null,reviewedAt:new Date(),reviewedById:req.user!.id,reviewNote}}));
}));
app.post('/api/drivers',allow(Role.FLEET_MANAGER,Role.SAFETY_OFFICER),asyncRoute(async(req,res)=>res.status(201).json(await db.driver.create({data:{...parse(driverSchema,req.body),organizationId:req.user!.organizationId}}))));
app.put('/api/drivers/:id',allow(Role.FLEET_MANAGER,Role.SAFETY_OFFICER),asyncRoute(async(req,res)=>{const row=await db.driver.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId}});if(!row)throw Object.assign(new Error('Driver not found'),{status:404});res.json(await db.driver.update({where:{id:row.id},data:parse(driverSchema.partial(),req.body)}))}));
app.delete('/api/drivers/:id',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const row=await db.driver.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId}});if(!row)throw Object.assign(new Error('Driver not found'),{status:404});if(row.userId)throw Object.assign(new Error('A driver with login access cannot be deleted; suspend the linked account instead'),{status:409});await db.driver.delete({where:{id:row.id}});res.status(204).end();}));

app.get('/api/driver/me',allow(Role.DRIVER),asyncRoute(async(req,res)=>{
  if(!req.user!.driverId)throw Object.assign(new Error('Driver profile is not linked to this account'),{status:409});
  const driver=await db.driver.findFirst({where:{id:req.user!.driverId,organizationId:req.user!.organizationId},include:{documents:{select:{id:true,type:true,createdAt:true,ocrConfidence:true}}}});if(!driver)throw Object.assign(new Error('Driver profile not found'),{status:404});res.json(driver);
}));

app.post('/api/driver/me/onboarding',allow(Role.DRIVER),upload.fields([{name:'profilePhoto',maxCount:1},{name:'licenseFront',maxCount:1},{name:'licenseBack',maxCount:1}]),asyncRoute(async(req,res)=>{
  if(!req.user!.driverId)throw Object.assign(new Error('Driver profile is not linked to this account'),{status:409});
  if(!objectStorageConfigured())throw Object.assign(new Error('Cloudflare R2 is not configured'),{status:503});
  const files=req.files as Record<string,Express.Multer.File[]>|undefined;const profilePhoto=files?.profilePhoto?.[0],licenseFront=files?.licenseFront?.[0],licenseBack=files?.licenseBack?.[0];
  if(!profilePhoto||!licenseFront)throw Object.assign(new Error('Profile photo and driving-licence front image are required'),{status:400});
  const extraction=await extractDrivingLicense(licenseFront.buffer);
  const uploads=await Promise.all([
    uploadPrivateObject({organizationId:req.user!.organizationId,folder:`drivers/${req.user!.driverId}/profile`,originalName:profilePhoto.originalname,mimeType:profilePhoto.mimetype,buffer:profilePhoto.buffer}),
    uploadPrivateObject({organizationId:req.user!.organizationId,folder:`drivers/${req.user!.driverId}/license`,originalName:licenseFront.originalname,mimeType:licenseFront.mimetype,buffer:licenseFront.buffer}),
    licenseBack?uploadPrivateObject({organizationId:req.user!.organizationId,folder:`drivers/${req.user!.driverId}/license`,originalName:licenseBack.originalname,mimeType:licenseBack.mimetype,buffer:licenseBack.buffer}):Promise.resolve(null)
  ]);
  const records=[{type:DriverDocumentType.PROFILE_PHOTO,file:profilePhoto,key:uploads[0],extractedData:undefined,ocrConfidence:undefined},{type:DriverDocumentType.LICENSE_FRONT,file:licenseFront,key:uploads[1],extractedData:JSON.parse(JSON.stringify(extraction)),ocrConfidence:extraction.confidence},...(licenseBack&&uploads[2]?[{type:DriverDocumentType.LICENSE_BACK,file:licenseBack,key:uploads[2],extractedData:undefined,ocrConfidence:undefined}]:[])];
  await db.$transaction(async tx=>{for(const record of records)await tx.driverDocument.upsert({where:{driverId_type:{driverId:req.user!.driverId!,type:record.type}},create:{organizationId:req.user!.organizationId,driverId:req.user!.driverId!,type:record.type,objectKey:record.key,mimeType:record.file.mimetype,originalName:record.file.originalname,extractedData:record.extractedData,ocrConfidence:record.ocrConfidence},update:{objectKey:record.key,mimeType:record.file.mimetype,originalName:record.file.originalname,extractedData:record.extractedData,ocrConfidence:record.ocrConfidence,createdAt:new Date()}});await tx.driver.update({where:{id:req.user!.driverId!},data:{onboardingStatus:DriverOnboardingStatus.NEEDS_REVIEW,status:DriverStatus.OFF_DUTY,reviewNote:null,reviewedAt:null,reviewedById:null}})});
  res.json({onboardingStatus:DriverOnboardingStatus.NEEDS_REVIEW,extracted:{name:extraction.name,licenseNo:extraction.licenseNo,licenseCategory:extraction.licenseCategory,licenseExpiry:extraction.licenseExpiry,confidence:extraction.confidence}});
}));

app.post('/api/driver/me/onboarding/confirm',allow(Role.DRIVER),asyncRoute(async(req,res)=>{
  if(!req.user!.driverId)throw Object.assign(new Error('Driver profile is not linked to this account'),{status:409});
  const data=parse(z.object({name:z.string().trim().min(2).max(80),licenseNo:z.string().trim().min(5).max(30),licenseCategory:z.string().trim().min(2).max(20),licenseExpiry:z.coerce.date(),contact:z.string().trim().min(7).max(20).optional()}),req.body);if(data.licenseExpiry<=new Date())throw Object.assign(new Error('Driving licence is expired'),{status:400});
  const requiredDocuments=await db.driverDocument.count({where:{driverId:req.user!.driverId,type:{in:[DriverDocumentType.PROFILE_PHOTO,DriverDocumentType.LICENSE_FRONT]}}});if(requiredDocuments<2)throw Object.assign(new Error('Upload the required onboarding photographs first'),{status:409});
  const driver=await db.$transaction(async tx=>{await tx.user.update({where:{id:req.user!.id},data:{name:data.name}});return tx.driver.update({where:{id:req.user!.driverId!},data:{...data,onboardingStatus:DriverOnboardingStatus.NEEDS_REVIEW,status:DriverStatus.OFF_DUTY,verifiedAt:null,reviewedAt:null,reviewedById:null,reviewNote:null}})});res.json(driver);
}));

const placeSchema=z.object({id:z.string().min(2).max(180),name:z.string().trim().min(2).max(180),label:z.string().trim().min(2).max(300),city:z.string().max(120).optional(),state:z.string().max(120),latitude:z.number().min(6).max(38),longitude:z.number().min(68).max(98),provider:z.enum(['GOOGLE','PHOTON','BUILT_IN'])});
const tripSchema=z.object({sourceLocation:placeSchema,destinationLocation:placeSchema,routeOptionId:z.enum(['SHORTEST','FASTEST','TOLL_SAVER']),vehicleId:z.string(),driverId:z.string(),cargoWeightKg:z.coerce.number().positive(),revenue:z.coerce.number().nonnegative().default(0)});
app.get('/api/routing/places',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{
  const query=parse(z.string().trim().min(2).max(120),String(req.query.q||''));res.json(await searchPlaces(query));
}));
app.post('/api/routing/estimate',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{
  const {sourceLocation,destinationLocation,vehicleId}=parse(z.object({sourceLocation:placeSchema,destinationLocation:placeSchema,vehicleId:z.string().optional()}),req.body);
  const vehicle=vehicleId?await db.vehicle.findFirst({where:{id:vehicleId,organizationId:req.user!.organizationId}}):null;
  if(vehicleId&&!vehicle)throw Object.assign(new Error('Vehicle not found'),{status:404});
  res.json(await estimateRoutes(sourceLocation,destinationLocation,vehicle?.type));
}));
app.get('/api/trips',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>res.json(await db.trip.findMany({where:{organizationId:req.user!.organizationId},include:{vehicle:true,driver:true},orderBy:{createdAt:'desc'}}))));
app.get('/api/trips/:id',allow(Role.DISPATCHER,Role.FLEET_MANAGER,Role.SAFETY_OFFICER),asyncRoute(async(req,res)=>{
  const trip=await db.trip.findFirst({
    where:{id:idParam(req),organizationId:req.user!.organizationId},
    include:{
      vehicle:true,
      driver:{
        include:{
          user:{select:{email:true,isActive:true,lastLoginAt:true}},
          documents:{orderBy:{createdAt:'desc'}},
          _count:{select:{trips:true,documents:true}}
        }
      },
      evidence:{orderBy:{createdAt:'desc'}},
      fuelLogs:{include:{driver:{select:{id:true,name:true}},vehicle:{select:{id:true,name:true,registrationNo:true}}},orderBy:{date:'desc'}},
      expenses:{include:{driver:{select:{id:true,name:true}},vehicle:{select:{id:true,name:true,registrationNo:true}}},orderBy:{date:'desc'}},
      maintenance:{include:{driver:{select:{id:true,name:true}},vehicle:{select:{id:true,name:true,registrationNo:true}}},orderBy:{startDate:'desc'}}
    }
  });
  if(!trip)throw Object.assign(new Error('Trip not found'),{status:404});
  const [documents,evidence,fuelLogs,expenses,maintenance]=await Promise.all([
    Promise.all(trip.driver.documents.map(async document=>{const {objectKey,...safeDocument}=document;return {...safeDocument,url:objectStorageConfigured()?await signedObjectUrl(objectKey):null}})),
    Promise.all(trip.evidence.map(async item=>{const {objectKey,...safeItem}=item;return {...safeItem,url:await signedPrivateUrl(objectKey)}})),
    Promise.all(trip.fuelLogs.map(async item=>{const {receiptObjectKey,...safeItem}=item;return {...safeItem,receiptUrl:await signedPrivateUrl(receiptObjectKey)}})),
    Promise.all(trip.expenses.map(async item=>{const {receiptObjectKey,...safeItem}=item;return {...safeItem,receiptUrl:await signedPrivateUrl(receiptObjectKey)}})),
    Promise.all(trip.maintenance.map(async item=>{const {objectKey,...safeItem}=item;return {...safeItem,photoUrl:await signedPrivateUrl(objectKey)}}))
  ]);
  res.json({...trip,driver:{...trip.driver,documents},evidence,fuelLogs,expenses,maintenance,costSummary:{fuel:fuelLogs.reduce((sum,item)=>sum+item.cost,0),expenses:expenses.reduce((sum,item)=>sum+item.amount,0),maintenance:maintenance.reduce((sum,item)=>sum+item.cost,0)}});
}));
app.post('/api/trips',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{
  const data=parse(tripSchema,req.body); const [v,d]=await Promise.all([db.vehicle.findFirst({where:{id:data.vehicleId,organizationId:req.user!.organizationId}}),db.driver.findFirst({where:{id:data.driverId,organizationId:req.user!.organizationId}})]);
  if(!v||!d) throw Object.assign(new Error('Vehicle or driver not found'),{status:404});
  if(v.status!==VehicleStatus.AVAILABLE) throw Object.assign(new Error('Selected vehicle is not available'),{status:409});
  if(d.status!==DriverStatus.AVAILABLE||d.licenseExpiry<=new Date()||(d.userId&&d.onboardingStatus!==DriverOnboardingStatus.VERIFIED)) throw Object.assign(new Error('Driver is unavailable, unverified, suspended, or license has expired'),{status:409});
  if(data.cargoWeightKg>v.capacityKg) throw Object.assign(new Error(`Cargo exceeds ${v.capacityKg} kg vehicle capacity`),{status:400});
  const estimate=await estimateRoutes(data.sourceLocation,data.destinationLocation,v.type);const selectedRoute=estimate.options.find(option=>option.id===data.routeOptionId);
  if(!selectedRoute)throw Object.assign(new Error('Selected route option is no longer available'),{status:409});
  const tripNo=`TRP${String((await db.trip.count({where:{organizationId:req.user!.organizationId}}))+1).padStart(4,'0')}`;
  res.status(201).json(await db.trip.create({data:{source:estimate.source.label,destination:estimate.destination.label,sourceCityId:data.sourceLocation.id,destinationCityId:data.destinationLocation.id,vehicleId:data.vehicleId,driverId:data.driverId,cargoWeightKg:data.cargoWeightKg,revenue:data.revenue,plannedDistanceKm:selectedRoute.distanceKm,estimatedDurationMinutes:selectedRoute.durationMinutes,estimatedToll:selectedRoute.estimatedToll,routeStrategy:selectedRoute.strategy,routeLabel:selectedRoute.label,routeVia:selectedRoute.via,routeProvider:selectedRoute.provider,tripNo,organizationId:req.user!.organizationId},include:{vehicle:true,driver:true}}));
}));
app.post('/api/trips/:id/dispatch',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{
  const trip=await db.trip.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId},include:{vehicle:true,driver:true}}); if(!trip) throw Object.assign(new Error('Trip not found'),{status:404});
  if(trip.status!==TripStatus.DRAFT) throw Object.assign(new Error('Only draft trips can be dispatched'),{status:409});
  if(trip.vehicle.status!==VehicleStatus.AVAILABLE||trip.driver.status!==DriverStatus.AVAILABLE||trip.driver.licenseExpiry<=new Date()||(trip.driver.userId&&trip.driver.onboardingStatus!==DriverOnboardingStatus.VERIFIED)) throw Object.assign(new Error('Vehicle or driver is no longer eligible'),{status:409});
  const result=await db.$transaction(async tx=>{await tx.vehicle.update({where:{id:trip.vehicleId},data:{status:VehicleStatus.ON_TRIP}});await tx.driver.update({where:{id:trip.driverId},data:{status:DriverStatus.ON_TRIP}});return tx.trip.update({where:{id:trip.id},data:{status:TripStatus.DISPATCHED,dispatchedAt:new Date()},include:{vehicle:true,driver:true}})}); res.json(result);
}));
app.post('/api/trips/:id/complete',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{
  const {finalOdometerKm,fuelConsumedL}=parse(z.object({finalOdometerKm:z.coerce.number().positive(),fuelConsumedL:z.coerce.number().positive()}),req.body); const trip=await db.trip.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId}}); if(!trip||(trip.status!==TripStatus.DISPATCHED&&trip.status!==TripStatus.IN_PROGRESS)) throw Object.assign(new Error('Only dispatched or active trips can be completed'),{status:409});
  const result=await db.$transaction(async tx=>{const reported=await tx.maintenance.count({where:{vehicleId:trip.vehicleId,status:MaintenanceStatus.REPORTED}});await tx.vehicle.update({where:{id:trip.vehicleId},data:{status:reported?VehicleStatus.IN_SHOP:VehicleStatus.AVAILABLE,odometerKm:finalOdometerKm}});if(reported)await tx.maintenance.updateMany({where:{vehicleId:trip.vehicleId,status:MaintenanceStatus.REPORTED},data:{status:MaintenanceStatus.ACTIVE}});await tx.driver.update({where:{id:trip.driverId},data:{status:DriverStatus.AVAILABLE}});return tx.trip.update({where:{id:trip.id},data:{status:TripStatus.COMPLETED,completedAt:new Date(),finalOdometerKm,fuelConsumedL},include:{vehicle:true,driver:true,maintenance:true}})});res.json(result);
}));
app.post('/api/trips/:id/cancel',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const trip=await db.trip.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId}});if(!trip||(trip.status!==TripStatus.DRAFT&&trip.status!==TripStatus.DISPATCHED))throw Object.assign(new Error('Trip cannot be cancelled'),{status:409});const wasLive=trip.status===TripStatus.DISPATCHED;const result=await db.$transaction(async tx=>{if(wasLive){await tx.vehicle.update({where:{id:trip.vehicleId},data:{status:VehicleStatus.AVAILABLE}});await tx.driver.update({where:{id:trip.driverId},data:{status:DriverStatus.AVAILABLE}})}return tx.trip.update({where:{id:trip.id},data:{status:TripStatus.CANCELLED},include:{vehicle:true,driver:true}})});res.json(result);}));

app.get('/api/driver/me/trips',allow(Role.DRIVER),asyncRoute(async(req,res)=>{if(!req.user!.driverId)throw Object.assign(new Error('Driver profile is not linked to this account'),{status:409});res.json(await db.trip.findMany({where:{organizationId:req.user!.organizationId,driverId:req.user!.driverId,status:{in:[TripStatus.DISPATCHED,TripStatus.IN_PROGRESS,TripStatus.COMPLETED]}},include:{vehicle:true},orderBy:{createdAt:'desc'}}));}));
app.get('/api/driver/me/trips/:id',allow(Role.DRIVER),asyncRoute(async(req,res)=>{
  if(!req.user!.driverId)throw Object.assign(new Error('Driver profile is not linked to this account'),{status:409});
  const trip=await db.trip.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId,driverId:req.user!.driverId},include:{vehicle:{include:{maintenance:{where:{status:{in:[MaintenanceStatus.REPORTED,MaintenanceStatus.ACTIVE]}},orderBy:{startDate:'desc'},take:10}}},evidence:{orderBy:{createdAt:'desc'}},fuelLogs:{orderBy:{date:'desc'}},expenses:{orderBy:{date:'desc'}},maintenance:{orderBy:{startDate:'desc'}}}});if(!trip)throw Object.assign(new Error('Assigned trip not found'),{status:404});
  const [evidence,fuelLogs,expenses,maintenance,vehicleMaintenance]=await Promise.all([
    Promise.all(trip.evidence.map(async item=>{const {objectKey,...safe}=item;return {...safe,url:await signedPrivateUrl(objectKey)}})),
    Promise.all(trip.fuelLogs.map(async item=>{const {receiptObjectKey,...safe}=item;return {...safe,receiptUrl:await signedPrivateUrl(receiptObjectKey)}})),
    Promise.all(trip.expenses.map(async item=>{const {receiptObjectKey,...safe}=item;return {...safe,receiptUrl:await signedPrivateUrl(receiptObjectKey)}})),
    Promise.all(trip.maintenance.map(async item=>{const {objectKey,...safe}=item;return {...safe,photoUrl:await signedPrivateUrl(objectKey)}})),
    Promise.all(trip.vehicle.maintenance.map(async item=>{const {objectKey,...safe}=item;return {...safe,photoUrl:await signedPrivateUrl(objectKey)}}))
  ]);
  res.json({...trip,vehicle:{...trip.vehicle,maintenance:vehicleMaintenance},evidence,fuelLogs,expenses,maintenance,costSummary:{fuel:fuelLogs.reduce((sum,item)=>sum+item.cost,0),expenses:expenses.reduce((sum,item)=>sum+item.amount,0),maintenance:maintenance.reduce((sum,item)=>sum+item.cost,0)}});
}));
app.post('/api/driver/me/trips/:id/start',allow(Role.DRIVER),upload.single('odometerPhoto'),asyncRoute(async(req,res)=>{
  if(!req.user!.driverId)throw Object.assign(new Error('Driver profile is not linked to this account'),{status:409});
  const trip=await db.trip.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId,driverId:req.user!.driverId},include:{vehicle:true,driver:true,evidence:true}});if(!trip)throw Object.assign(new Error('Assigned trip not found'),{status:404});
  if(trip.status===TripStatus.IN_PROGRESS)return res.json(trip);
  if(trip.status!==TripStatus.DISPATCHED)throw Object.assign(new Error('Only a dispatched trip can be started'),{status:409});if(trip.driver.onboardingStatus!==DriverOnboardingStatus.VERIFIED)throw Object.assign(new Error('Complete driver verification before starting a trip'),{status:409});
  const {vehicleRegistrationNo,confirmedOdometerKm}=parse(z.object({vehicleRegistrationNo:z.string().min(4),confirmedOdometerKm:z.coerce.number().nonnegative().optional()}),req.body);if(normalizeRegistration(vehicleRegistrationNo)!==normalizeRegistration(trip.vehicle.registrationNo))throw Object.assign(new Error('Vehicle registration does not match the assigned vehicle'),{status:409});if(!req.file)throw Object.assign(new Error('An odometer photograph is required'),{status:400});
  const ocr=await extractOdometer(req.file.buffer).catch(()=>({odometerKm:undefined,rawText:'',confidence:0}));const odometerKm=ocr.odometerKm??confirmedOdometerKm;if(odometerKm===undefined)throw Object.assign(new Error('Odometer could not be read. Confirm the reading and try again.'),{status:422});if(odometerKm<trip.vehicle.odometerKm)throw Object.assign(new Error(`Odometer reading cannot be below ${trip.vehicle.odometerKm} km`),{status:400});
  const objectKey=await uploadPrivateObject({organizationId:req.user!.organizationId,folder:`trips/${trip.id}/evidence`,originalName:req.file.originalname,mimeType:req.file.mimetype,buffer:req.file.buffer});
  const result=await db.$transaction(async tx=>{await tx.tripEvidence.create({data:{organizationId:req.user!.organizationId,tripId:trip.id,driverId:req.user!.driverId!,vehicleId:trip.vehicleId,type:TripEvidenceType.ODOMETER_START,objectKey,mimeType:req.file!.mimetype,originalName:req.file!.originalname,extractedOdometerKm:odometerKm,ocrConfidence:ocr.confidence,registrationNo:trip.vehicle.registrationNo}});return tx.trip.update({where:{id:trip.id},data:{status:TripStatus.IN_PROGRESS,startedAt:new Date(),startOdometerKm:odometerKm},include:{vehicle:true,driver:true,evidence:true}})});res.json(result);
}));
app.post('/api/driver/me/trips/:id/updates',allow(Role.DRIVER),upload.single('photo'),asyncRoute(async(req,res)=>{
  if(!req.user!.driverId)throw Object.assign(new Error('Driver profile is not linked to this account'),{status:409});
  const data=parse(z.object({note:z.string().trim().min(2).max(500),latitude:z.coerce.number().min(-90).max(90).optional(),longitude:z.coerce.number().min(-180).max(180).optional(),clientRequestId:z.string().trim().min(8).max(100)}),req.body);
  const trip=await db.trip.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId,driverId:req.user!.driverId}});if(!trip)throw Object.assign(new Error('Assigned trip not found'),{status:404});if(trip.status!==TripStatus.IN_PROGRESS)throw Object.assign(new Error('On-site updates are allowed only during an active trip'),{status:409});
  const existing=await db.tripEvidence.findUnique({where:{clientRequestId:data.clientRequestId}});if(existing){if(existing.organizationId!==req.user!.organizationId||existing.driverId!==req.user!.driverId)throw Object.assign(new Error('Invalid idempotency key'),{status:409});return res.json(existing)}
  const objectKey=req.file?await uploadPrivateObject({organizationId:req.user!.organizationId,folder:`trips/${trip.id}/updates`,originalName:req.file.originalname,mimeType:req.file.mimetype,buffer:req.file.buffer}):undefined;
  res.status(201).json(await db.tripEvidence.create({data:{organizationId:req.user!.organizationId,tripId:trip.id,driverId:req.user!.driverId,vehicleId:trip.vehicleId,type:TripEvidenceType.SITE_UPDATE,note:data.note,latitude:data.latitude,longitude:data.longitude,clientRequestId:data.clientRequestId,objectKey,mimeType:req.file?.mimetype,originalName:req.file?.originalname}}));
}));
app.post('/api/driver/me/trips/:id/fuel',allow(Role.DRIVER),upload.single('fuelPhoto'),asyncRoute(async(req,res)=>{
  if(!req.user!.driverId)throw Object.assign(new Error('Driver profile is not linked to this account'),{status:409});
  const data=parse(z.object({liters:optionalPositiveNumber,confirmedLiters:optionalPositiveNumber,amount:optionalPositiveNumber,confirmedAmount:optionalPositiveNumber,odometerKm:z.coerce.number().nonnegative(),fuelStation:z.string().trim().max(120).optional(),clientRequestId:z.string().trim().min(8).max(100)}),req.body);if(!req.file)throw Object.assign(new Error('A fuel pump or receipt photograph is required'),{status:400});
  const trip=await db.trip.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId,driverId:req.user!.driverId},include:{vehicle:true}});if(!trip)throw Object.assign(new Error('Assigned trip not found'),{status:404});if(trip.status!==TripStatus.IN_PROGRESS)throw Object.assign(new Error('Fuel can be logged only during an active trip'),{status:409});if(data.odometerKm<trip.vehicle.odometerKm)throw Object.assign(new Error(`Odometer reading cannot be below ${trip.vehicle.odometerKm} km`),{status:400});
  const existing=await db.fuelLog.findUnique({where:{clientRequestId:data.clientRequestId}});if(existing){if(existing.organizationId!==req.user!.organizationId||existing.driverId!==req.user!.driverId)throw Object.assign(new Error('Invalid idempotency key'),{status:409});return res.json({...existing,alreadyProcessed:true})}
  const ocr=await extractReceipt(req.file.buffer).catch(()=>({amount:undefined,liters:undefined,vendor:undefined,date:undefined,rawText:'',confidence:0}));const liters=data.confirmedLiters??data.liters??ocr.liters;const amount=data.confirmedAmount??data.amount??ocr.amount;if(liters===undefined||amount===undefined)throw Object.assign(new Error('Fuel receipt OCR needs confirmation. Submit confirmed liters and amount.'),{status:422});if(liters>2000)throw Object.assign(new Error('Fuel volume is outside the supported range'),{status:400});
  const objectKey=await uploadPrivateObject({organizationId:req.user!.organizationId,folder:`trips/${trip.id}/fuel`,originalName:req.file.originalname,mimeType:req.file.mimetype,buffer:req.file.buffer});
  const extractedData=JSON.parse(JSON.stringify(ocr));const result=await db.$transaction(async tx=>{const fuelLog=await tx.fuelLog.create({data:{organizationId:req.user!.organizationId,vehicleId:trip.vehicleId,tripId:trip.id,driverId:req.user!.driverId!,liters,cost:amount,odometerKm:data.odometerKm,fuelStation:data.fuelStation||ocr.vendor,source:RecordSource.DRIVER_MOBILE,receiptObjectKey:objectKey,receiptMimeType:req.file!.mimetype,receiptName:req.file!.originalname,ocrConfidence:ocr.confidence,extractedData,clientRequestId:data.clientRequestId},include:{vehicle:true,driver:true,trip:true}});const evidence=await tx.tripEvidence.create({data:{organizationId:req.user!.organizationId,tripId:trip.id,driverId:req.user!.driverId!,vehicleId:trip.vehicleId,type:TripEvidenceType.FUEL_RECEIPT,objectKey,mimeType:req.file!.mimetype,originalName:req.file!.originalname,extractedOdometerKm:data.odometerKm,ocrConfidence:ocr.confidence,fuelLiters:liters,amount,fuelStation:data.fuelStation||ocr.vendor,clientRequestId:data.clientRequestId,note:(data.fuelStation||ocr.vendor)?`Fuel at ${data.fuelStation||ocr.vendor}`:'Fuel entry'}});return {fuelLog:{...fuelLog,receiptObjectKey:undefined,receiptUrl:await signedPrivateUrl(objectKey)},evidence:{...evidence,objectKey:undefined,url:await signedPrivateUrl(objectKey)},extracted:{amount:ocr.amount,liters:ocr.liters,vendor:ocr.vendor,confidence:ocr.confidence}}});res.status(201).json(result);
}));
app.post('/api/driver/me/trips/:id/expenses',allow(Role.DRIVER),upload.single('receiptPhoto'),asyncRoute(async(req,res)=>{
  if(!req.user!.driverId)throw Object.assign(new Error('Driver profile is not linked to this account'),{status:409});
  const data=parse(z.object({type:z.enum(ExpenseType),amount:optionalPositiveNumber,confirmedAmount:optionalPositiveNumber,vendor:z.string().trim().max(120).optional(),description:z.string().trim().max(300).optional(),clientRequestId:z.string().trim().min(8).max(100)}),req.body);if(!req.file)throw Object.assign(new Error('An expense receipt photograph is required'),{status:400});
  const trip=await db.trip.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId,driverId:req.user!.driverId}});if(!trip)throw Object.assign(new Error('Assigned trip not found'),{status:404});if(trip.status!==TripStatus.IN_PROGRESS)throw Object.assign(new Error('Expenses can be logged only during an active trip'),{status:409});
  const existing=await db.expense.findUnique({where:{clientRequestId:data.clientRequestId}});if(existing){if(existing.organizationId!==req.user!.organizationId||existing.driverId!==req.user!.driverId)throw Object.assign(new Error('Invalid idempotency key'),{status:409});return res.json({...existing,alreadyProcessed:true})}
  const ocr=await extractReceipt(req.file.buffer).catch(()=>({amount:undefined,liters:undefined,vendor:undefined,date:undefined,rawText:'',confidence:0}));const amount=data.confirmedAmount??data.amount??ocr.amount;if(amount===undefined)throw Object.assign(new Error('Receipt OCR could not confirm the total. Submit confirmedAmount after driver review.'),{status:422});
  const objectKey=await uploadPrivateObject({organizationId:req.user!.organizationId,folder:`trips/${trip.id}/expenses`,originalName:req.file.originalname,mimeType:req.file.mimetype,buffer:req.file.buffer});const vendor=data.vendor||ocr.vendor;
  const extractedData=JSON.parse(JSON.stringify(ocr));const result=await db.$transaction(async tx=>{const expense=await tx.expense.create({data:{organizationId:req.user!.organizationId,vehicleId:trip.vehicleId,tripId:trip.id,driverId:req.user!.driverId!,type:data.type,amount,vendor,description:data.description,source:RecordSource.DRIVER_MOBILE,receiptObjectKey:objectKey,receiptMimeType:req.file!.mimetype,receiptName:req.file!.originalname,ocrConfidence:ocr.confidence,extractedData,clientRequestId:data.clientRequestId},include:{vehicle:true,driver:true,trip:true}});const evidence=await tx.tripEvidence.create({data:{organizationId:req.user!.organizationId,tripId:trip.id,driverId:req.user!.driverId!,vehicleId:trip.vehicleId,type:TripEvidenceType.EXPENSE_RECEIPT,objectKey,mimeType:req.file!.mimetype,originalName:req.file!.originalname,ocrConfidence:ocr.confidence,amount,clientRequestId:data.clientRequestId,note:`${data.type}${vendor?` · ${vendor}`:''}${data.description?` · ${data.description}`:''}`}});return {expense,evidence}});res.status(201).json({expense:{...result.expense,receiptObjectKey:undefined,receiptUrl:await signedPrivateUrl(objectKey)},evidence:{...result.evidence,objectKey:undefined,url:await signedPrivateUrl(objectKey)},extracted:{amount:ocr.amount,vendor:ocr.vendor,date:ocr.date,confidence:ocr.confidence}});
}));
app.post('/api/driver/me/trips/:id/maintenance',allow(Role.DRIVER),upload.single('photo'),asyncRoute(async(req,res)=>{
  if(!req.user!.driverId)throw Object.assign(new Error('Driver profile is not linked to this account'),{status:409});
  const data=parse(z.object({serviceType:z.string().trim().min(2).max(100),description:z.string().trim().min(5).max(500),severity:z.enum(['LOW','MEDIUM','HIGH','CRITICAL']),odometerKm:optionalNonnegativeNumber,clientRequestId:z.string().trim().min(8).max(100)}),req.body);
  const trip=await db.trip.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId,driverId:req.user!.driverId},include:{vehicle:true}});if(!trip)throw Object.assign(new Error('Assigned trip not found'),{status:404});if(trip.status!==TripStatus.DISPATCHED&&trip.status!==TripStatus.IN_PROGRESS)throw Object.assign(new Error('Maintenance can be reported only for a dispatched or active trip'),{status:409});
  const existing=await db.maintenance.findUnique({where:{clientRequestId:data.clientRequestId}});if(existing){if(existing.organizationId!==req.user!.organizationId||existing.driverId!==req.user!.driverId)throw Object.assign(new Error('Invalid idempotency key'),{status:409});return res.json({...existing,alreadyProcessed:true})}
  const objectKey=req.file?await uploadPrivateObject({organizationId:req.user!.organizationId,folder:`trips/${trip.id}/maintenance`,originalName:req.file.originalname,mimeType:req.file.mimetype,buffer:req.file.buffer}):undefined;
  const report=await db.maintenance.create({data:{organizationId:req.user!.organizationId,vehicleId:trip.vehicleId,tripId:trip.id,driverId:req.user!.driverId,serviceType:data.serviceType,description:data.description,severity:data.severity,reportedOdometerKm:data.odometerKm,source:RecordSource.DRIVER_MOBILE,status:MaintenanceStatus.REPORTED,objectKey,mimeType:req.file?.mimetype,originalName:req.file?.originalname,clientRequestId:data.clientRequestId},include:{vehicle:true,driver:true,trip:true}});res.status(201).json({...report,objectKey:undefined,photoUrl:await signedPrivateUrl(objectKey)});
}));

const maintenanceSchema=z.object({vehicleId:z.string(),serviceType:z.string().min(2),description:z.string().optional(),cost:z.coerce.number().nonnegative()});
app.get('/api/maintenance',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{
  const rows=await db.maintenance.findMany({where:{organizationId:req.user!.organizationId},include:{vehicle:true,driver:{select:{id:true,name:true}},trip:{select:{id:true,tripNo:true,source:true,destination:true}}},orderBy:{startDate:'desc'}});
  const safeRows=await Promise.all(rows.map(async row=>{const {objectKey,...safe}=row;return {...safe,photoUrl:await signedPrivateUrl(objectKey)}}));
  res.json(safeRows);
}));
app.post('/api/maintenance',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const data=parse(maintenanceSchema,req.body);const v=await db.vehicle.findFirst({where:{id:data.vehicleId,organizationId:req.user!.organizationId}});if(!v||v.status!==VehicleStatus.AVAILABLE)throw Object.assign(new Error('Only available vehicles can enter maintenance'),{status:409});const result=await db.$transaction(async tx=>{await tx.vehicle.update({where:{id:v.id},data:{status:VehicleStatus.IN_SHOP}});return tx.maintenance.create({data:{...data,organizationId:req.user!.organizationId,source:RecordSource.WEB,status:MaintenanceStatus.ACTIVE},include:{vehicle:true}})});res.status(201).json(result);}));
app.post('/api/maintenance/:id/start',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const m=await db.maintenance.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId},include:{vehicle:true}});if(!m||m.status!==MaintenanceStatus.REPORTED)throw Object.assign(new Error('Reported maintenance item not found'),{status:404});if(m.vehicle.status===VehicleStatus.ON_TRIP)throw Object.assign(new Error('The report is synchronized, but workshop service can start only after the active trip is completed'),{status:409});if(m.vehicle.status===VehicleStatus.RETIRED)throw Object.assign(new Error('A retired vehicle cannot enter maintenance'),{status:409});const result=await db.$transaction(async tx=>{await tx.vehicle.update({where:{id:m.vehicleId},data:{status:VehicleStatus.IN_SHOP}});return tx.maintenance.update({where:{id:m.id},data:{status:MaintenanceStatus.ACTIVE},include:{vehicle:true,driver:true,trip:true}})});res.json(result);}));
app.post('/api/maintenance/:id/close',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const m=await db.maintenance.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId},include:{vehicle:true}});if(!m||(m.status!==MaintenanceStatus.ACTIVE&&m.status!==MaintenanceStatus.REPORTED))throw Object.assign(new Error('Open maintenance record not found'),{status:404});const result=await db.$transaction(async tx=>{if(m.status===MaintenanceStatus.ACTIVE&&m.vehicle.status!==VehicleStatus.RETIRED)await tx.vehicle.update({where:{id:m.vehicleId},data:{status:VehicleStatus.AVAILABLE}});return tx.maintenance.update({where:{id:m.id},data:{status:MaintenanceStatus.CLOSED,endDate:new Date()},include:{vehicle:true,driver:true,trip:true}})});res.json(result);}));

app.get('/api/finance',allow(Role.FINANCIAL_ANALYST,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const where={organizationId:req.user!.organizationId};const [rawFuelLogs,rawExpenses]=await Promise.all([db.fuelLog.findMany({where,include:{vehicle:true,driver:{select:{id:true,name:true}},trip:{select:{id:true,tripNo:true,source:true,destination:true}}},orderBy:{date:'desc'}}),db.expense.findMany({where,include:{vehicle:true,driver:{select:{id:true,name:true}},trip:{select:{id:true,tripNo:true,source:true,destination:true}}},orderBy:{date:'desc'}})]);const [fuelLogs,expenses]=await Promise.all([Promise.all(rawFuelLogs.map(async item=>{const {receiptObjectKey,...safe}=item;return {...safe,receiptUrl:await signedPrivateUrl(receiptObjectKey)}})),Promise.all(rawExpenses.map(async item=>{const {receiptObjectKey,...safe}=item;return {...safe,receiptUrl:await signedPrivateUrl(receiptObjectKey)}}))]);const driverTotals=new Map<string,{driverId:string|null;driverName:string;fuel:number;expenses:number;total:number}>(),tripTotals=new Map<string,{tripId:string|null;tripNo:string;route:string;fuel:number;expenses:number;total:number}>();for(const item of fuelLogs){const dk=item.driverId||'unassigned',d=driverTotals.get(dk)||{driverId:item.driverId,driverName:item.driver?.name||'Unassigned',fuel:0,expenses:0,total:0};d.fuel+=item.cost;d.total+=item.cost;driverTotals.set(dk,d);const tk=item.tripId||'unassigned',t=tripTotals.get(tk)||{tripId:item.tripId,tripNo:item.trip?.tripNo||'Unassigned',route:item.trip?`${item.trip.source} → ${item.trip.destination}`:'No trip',fuel:0,expenses:0,total:0};t.fuel+=item.cost;t.total+=item.cost;tripTotals.set(tk,t)}for(const item of expenses){const dk=item.driverId||'unassigned',d=driverTotals.get(dk)||{driverId:item.driverId,driverName:item.driver?.name||'Unassigned',fuel:0,expenses:0,total:0};d.expenses+=item.amount;d.total+=item.amount;driverTotals.set(dk,d);const tk=item.tripId||'unassigned',t=tripTotals.get(tk)||{tripId:item.tripId,tripNo:item.trip?.tripNo||'Unassigned',route:item.trip?`${item.trip.source} → ${item.trip.destination}`:'No trip',fuel:0,expenses:0,total:0};t.expenses+=item.amount;t.total+=item.amount;tripTotals.set(tk,t)}res.json({fuelLogs,expenses,byDriver:[...driverTotals.values()].sort((a,b)=>b.total-a.total),byTrip:[...tripTotals.values()].sort((a,b)=>b.total-a.total)});}));
app.post('/api/fuel',allow(Role.FINANCIAL_ANALYST,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const data=parse(z.object({vehicleId:z.string(),liters:z.coerce.number().positive(),cost:z.coerce.number().positive(),date:z.coerce.date().optional(),odometerKm:z.coerce.number().positive().optional()}),req.body);const vehicle=await db.vehicle.findFirst({where:{id:data.vehicleId,organizationId:req.user!.organizationId}});if(!vehicle)throw Object.assign(new Error('Vehicle not found'),{status:404});res.status(201).json(await db.fuelLog.create({data:{...data,source:RecordSource.WEB,organizationId:req.user!.organizationId},include:{vehicle:true}}));}));
app.post('/api/expenses',allow(Role.FINANCIAL_ANALYST,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const data=parse(z.object({vehicleId:z.string(),type:z.enum(ExpenseType),description:z.string().optional(),amount:z.coerce.number().positive(),date:z.coerce.date().optional()}),req.body);const vehicle=await db.vehicle.findFirst({where:{id:data.vehicleId,organizationId:req.user!.organizationId}});if(!vehicle)throw Object.assign(new Error('Vehicle not found'),{status:404});res.status(201).json(await db.expense.create({data:{...data,source:RecordSource.WEB,organizationId:req.user!.organizationId},include:{vehicle:true}}));}));

async function analytics(organizationId:string){
  const where={organizationId};const [vehicles,fuel,maintenance,expenses,trips]=await Promise.all([db.vehicle.findMany({where}),db.fuelLog.findMany({where}),db.maintenance.findMany({where}),db.expense.findMany({where}),db.trip.findMany({where})]);
  const totalFuel=fuel.reduce((s,x)=>s+x.cost,0), totalMaintenance=maintenance.reduce((s,x)=>s+x.cost,0), totalOther=expenses.reduce((s,x)=>s+x.amount,0), liters=fuel.reduce((s,x)=>s+x.liters,0), distance=trips.filter(x=>x.status===TripStatus.COMPLETED).reduce((s,x)=>s+x.plannedDistanceKm,0), revenue=trips.reduce((s,x)=>s+x.revenue,0), acquisition=vehicles.reduce((s,x)=>s+x.acquisitionCost,0), active=vehicles.filter(x=>x.status!==VehicleStatus.RETIRED).length;
  const byVehicle=vehicles.map(v=>{const vf=fuel.filter(x=>x.vehicleId===v.id).reduce((s,x)=>s+x.cost,0),vm=maintenance.filter(x=>x.vehicleId===v.id).reduce((s,x)=>s+x.cost,0),ve=expenses.filter(x=>x.vehicleId===v.id).reduce((s,x)=>s+x.amount,0),vr=trips.filter(x=>x.vehicleId===v.id).reduce((s,x)=>s+x.revenue,0);return{id:v.id,name:v.name,registrationNo:v.registrationNo,operationalCost:vf+vm+ve,roi:v.acquisitionCost?((vr-vf-vm)/v.acquisitionCost)*100:0}});
  return {summary:{fuelEfficiency:liters?distance/liters:0,fleetUtilization:active?vehicles.filter(x=>x.status===VehicleStatus.ON_TRIP).length/active*100:0,operationalCost:totalFuel+totalMaintenance+totalOther,vehicleRoi:acquisition?(revenue-totalFuel-totalMaintenance)/acquisition*100:0},byVehicle};
}
app.get('/api/analytics',allow(),asyncRoute(async(req,res)=>res.json(await analytics(req.user!.organizationId))));
app.get('/api/analytics/export.csv',asyncRoute(async(req,res)=>{const a=await analytics(req.user!.organizationId);const csv=['Vehicle,Registration,Operational Cost,ROI %',...a.byVehicle.map(x=>`"${x.name}","${x.registrationNo}",${x.operationalCost.toFixed(2)},${x.roi.toFixed(2)}`)].join('\n');res.type('text/csv').attachment('fleetpilot-analytics.csv').send(csv);}));

app.use((err:any,_req:Request,res:Response,_next:NextFunction)=>{console.error(err);if(err instanceof Prisma.PrismaClientKnownRequestError){if(err.code==='P2002')return res.status(409).json({message:'A record with this unique value already exists'});if(err.code==='P2022')return res.status(503).json({message:'Database setup is incomplete. Please run the latest FleetPilot migration.'});return res.status(500).json({message:'The database could not complete this request'});}if(err instanceof Prisma.PrismaClientValidationError)return res.status(400).json({message:'The request contains invalid data'});res.status(err.status||500).json({message:err.status?err.message:'Something went wrong. Please try again.'});});
app.listen(PORT,()=>console.log(`TransitOps API running at http://localhost:${PORT}`));
process.on('SIGTERM',async()=>{await db.$disconnect();process.exit(0)});
