import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { DriverDocumentType, DriverOnboardingStatus, DriverPayType, ExpenseType, Prisma, PrismaClient, Role, TripStatus, VehicleStatus, DriverStatus, MaintenanceStatus, LicenseCategory } from '@prisma/client';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { assertAssignmentEligible, AssignmentEligibilityError } from './services/assignmentEligibility';
import { buildFuelPrediction, calculateRealizedTripProfitability, calculateTripProfitability, loadTripProfitabilityConfig, type TripProfitabilityEstimate } from './services/tripProfitability';
import { calculateFleetAnalytics } from './services/fleetAnalytics';
import { buildHistoricalTollObservations, estimateHistoricalToll, resolveTollVehicleClass } from './services/historicalTollEstimate';
import { estimateRoutes, searchPlaces, type Place } from './constants/routePlanning';
import { createChatRouter } from './chat/chat';
import { objectStorageConfigured, signedObjectUrl, uploadPrivateObject } from './services/objectStorage';
import { extractDrivingLicense, extractReceipt } from './services/ocr';
import { disclosurePolicyForRole } from './chat/security';
import { SESSION_COOKIE, sessionCookieOptions, sessionToken, sessionVersionMatches } from './auth/session';
import { passwordSchema } from './auth/passwordPolicy';
import { InvalidResetTokenError, PasswordResetService } from './auth/passwordReset';
import { createRateLimit, privacyHash } from './auth/rateLimit';
import { assertEmailConfiguration } from './services/email';
import { locationTimestampBelongsToDispatch,trackingStatus } from './services/locationTracking';

const db = new PrismaClient();
const app = express();
const PORT = Number(process.env.PORT || 4000);
const SECRET = process.env.JWT_SECRET || 'development-only-change-me';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const tripProfitabilityConfig = loadTripProfitabilityConfig();
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map(origin => origin.trim());
const cookieOptions=sessionCookieOptions(process.env.NODE_ENV==='production');
const {maxAge:_maxAge,...clearCookieOptions}=cookieOptions;
const passwordResetService = new PasswordResetService(db,process.env.PASSWORD_RESET_URL||`${allowedOrigins[0]}/reset-password`);
assertEmailConfiguration();
const tripLocationStreams=new Map<string,Set<Response>>();
const publishTripLocation=(tripId:string,payload:unknown)=>{
  const message=`data: ${JSON.stringify(payload)}\n\n`;
  tripLocationStreams.get(tripId)?.forEach(stream=>stream.write(message));
};
app.use((_req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");res.setHeader('Cross-Origin-Resource-Policy','same-site');next()});
app.use(cors({ origin: (origin,callback) => !origin || allowedOrigins.includes(origin) ? callback(null,true) : callback(Object.assign(new Error('Origin is not allowed by CORS'),{status:403})), credentials: true }));
app.use(express.json());
app.use('/api',(req,res,next)=>{if(['GET','HEAD','OPTIONS'].includes(req.method)||!req.headers.origin||allowedOrigins.includes(req.headers.origin))return next();res.status(403).json({message:'Request origin is not allowed'})});
const imageMimeByExtension:Record<string,string>={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif'};
const acceptedImageMimeTypes=new Set(Object.values(imageMimeByExtension));
const imageMimeType=(file:{mimetype:string;originalname:string})=>{
  if(acceptedImageMimeTypes.has(file.mimetype))return file.mimetype;
  const extension=file.originalname.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return extension?imageMimeByExtension[extension]||null:null;
};
const avatarUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024,files:1},fileFilter:(_req,file,callback)=>callback(null,Boolean(imageMimeType(file)))});
const driverDocumentUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:3},fileFilter:(_req,file,callback)=>callback(null,Boolean(imageMimeType(file)))});
const driverReceiptUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024,files:1},fileFilter:(_req,file,callback)=>callback(null,Boolean(imageMimeType(file)))});

type Session = { id:string; name:string; email:string; phone?:string|null; jobTitle?:string|null; role:Role; organizationId:string; organizationName:string; driverId?:string|null; onboardingStatus?:DriverOnboardingStatus|null; mustChangePassword:boolean };
type SessionClaims = Session & { sessionVersion?:number };
type SessionAccount = { id:string; name:string; email:string; phone?:string|null; jobTitle?:string|null; role:Role; organizationId:string; mustChangePassword:boolean; sessionVersion:number; organization:{name:string}; driver?:{id:string;onboardingStatus:DriverOnboardingStatus}|null };
declare global { namespace Express { interface Request { user?: Session } } }
const asyncRoute = (fn:(req:Request,res:Response,next:NextFunction)=>Promise<unknown>) => (req:Request,res:Response,next:NextFunction) => { Promise.resolve(fn(req,res,next)).catch(next); };
const authenticate = asyncRoute(async (req,res,next) => {
  const token = sessionToken({authorization:req.headers.authorization,cookie:req.headers.cookie});
  if (!token) return res.status(401).json({message:'Authentication required'});
  try { const claims=jwt.verify(token,SECRET) as SessionClaims;const account=await db.user.findUnique({where:{id:claims.id},include:{organization:true,driver:true}});if(!account||!account.isActive||!sessionVersionMatches(claims.sessionVersion,account.sessionVersion))return res.status(401).json({message:'This session no longer has access'});await db.user.update({where:{id:account.id},data:{lastActiveAt:new Date()}});req.user=publicUser(account);next(); }
  catch { res.status(401).json({message:'Session expired. Please sign in again.'}); }
});
const elevated = [Role.OWNER,Role.ADMIN];
const allow = (...roles:Role[]) => (req:Request,res:Response,next:NextFunction) => [...elevated,...roles].includes(req.user!.role) ? next() : res.status(403).json({message:'You do not have permission for this action'});
const driverOnly = (req:Request,res:Response,next:NextFunction) => req.user!.role===Role.DRIVER&&req.user!.driverId ? next() : res.status(403).json({message:'A linked driver account is required for this action'});
const parse = <T>(schema:z.ZodType<T>, data:unknown) => { const out=schema.safeParse(data); if(!out.success) throw Object.assign(new Error(out.error.issues[0]?.message || 'Invalid request'),{status:400}); return out.data; };
const idParam = (req:Request) => String(req.params.id);
const slugify = (name:string) => name.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,45);
const moneyForLog = (amount:number) => `INR ${Math.round(amount).toLocaleString('en-IN')}`;
const publicUser = (user:{id:string;name:string;email:string;phone?:string|null;jobTitle?:string|null;role:Role;organizationId:string;organization:{name:string};mustChangePassword:boolean;driver?:{id:string;onboardingStatus:DriverOnboardingStatus}|null}):Session => ({id:user.id,name:user.name,email:user.email,phone:user.phone,jobTitle:user.jobTitle,role:user.role,organizationId:user.organizationId,organizationName:user.organization.name,driverId:user.driver?.id||null,onboardingStatus:user.driver?.onboardingStatus||null,mustChangePassword:user.mustChangePassword});
const sendSession = (res:Response,account:SessionAccount,status=200) => {const user=publicUser(account);res.cookie(SESSION_COOKIE,jwt.sign({...user,sessionVersion:account.sessionVersion},SECRET,{expiresIn:'8h'}),cookieOptions);res.setHeader('Cache-Control','no-store');return res.status(status).json({user})};
const modulesByRole:Record<Role,string[]>={
  OWNER:['Overview','Fleet registry','Drivers','Driver access','Trip dispatch','Profitability','Maintenance','Fuel & expenses','Reports','Company settings','User access'],
  ADMIN:['Overview','Fleet registry','Drivers','Driver access','Trip dispatch','Profitability','Maintenance','Fuel & expenses','Reports','Company settings','User access'],
  FLEET_MANAGER:['Overview','Fleet registry','Drivers','Driver access','Trip dispatch','Profitability','Maintenance','Fuel & expenses'],
  DISPATCHER:['Overview','Trip dispatch','Profitability'],
  SAFETY_OFFICER:['Overview','Drivers'],
  FINANCIAL_ANALYST:['Overview','Profitability','Fuel & expenses'],
  DRIVER:['Driver mobile app']
};
async function profileResponse(userId:string){
  const user=await db.user.findUnique({where:{id:userId},include:{organization:true,driver:true}});
  if(!user)throw Object.assign(new Error('Profile not found'),{status:404});
  return {...publicUser(user),avatarUrl:user.avatarKey&&objectStorageConfigured()?await signedObjectUrl(user.avatarKey,900):null,allowedModules:modulesByRole[user.role]};
}
async function driverProfileResponse(driverId:string,organizationId:string){
  const driver=await db.driver.findFirst({where:{id:driverId,organizationId},include:{documents:true,user:{select:{email:true}}}});
  if(!driver)throw Object.assign(new Error('Driver profile not found'),{status:404});
  const documents=await Promise.all(driver.documents.map(async document=>({id:document.id,type:document.type,originalName:document.originalName,mimeType:document.mimeType,size:document.size,url:objectStorageConfigured()?await signedObjectUrl(document.objectKey,900):null})));
  return {id:driver.id,name:driver.name,email:driver.user?.email||null,contact:driver.contact,licenseNo:driver.licenseNo.startsWith('PENDING-')?'':driver.licenseNo,licenseCategory:driver.licenseCategory,licenseExpiry:driver.licenseExpiry.getTime()===0?null:driver.licenseExpiry,onboardingStatus:driver.onboardingStatus,reviewNote:driver.reviewNote,documents};
}
async function expenseResponse(expense:Prisma.ExpenseGetPayload<{include:{vehicle:true;submittedByDriver:{select:{id:true;name:true}}}}>) {
  const {receiptObjectKey,...safeExpense}=expense;
  return {...safeExpense,receiptOriginalName:expense.receiptName,receiptUrl:receiptObjectKey&&objectStorageConfigured()?await signedObjectUrl(receiptObjectKey,900):null};
}
async function driverDashboardResponse(driverId:string,organizationId:string){
  const [profile,trips,expenses]=await Promise.all([
    driverProfileResponse(driverId,organizationId),
    db.trip.findMany({where:{driverId,organizationId},include:{vehicle:true,driver:true},orderBy:{createdAt:'desc'},take:20}),
    db.expense.findMany({where:{driverId,organizationId},include:{vehicle:true,submittedByDriver:{select:{id:true,name:true}}},orderBy:{date:'desc'},take:20})
  ]);
  return {profile,trips,expenses:await Promise.all(expenses.map(expenseResponse))};
}
const requestIp=(req:Request)=>req.ip||req.socket.remoteAddress||'unknown';
const forgotIpLimit=createRateLimit({windowMs:60*60_000,max:20,key:requestIp});
const forgotEmailLimit=createRateLimit({windowMs:60*60_000,max:5,key:req=>privacyHash(String(req.body?.email||''))});
const resetIpLimit=createRateLimit({windowMs:15*60_000,max:10,key:requestIp});
const authAudit=(event:string,requestId:string,result:string,userId?:string)=>console.info(JSON.stringify({event,requestId,result,...(userId?{userId}:{}),occurredAt:new Date().toISOString()}));

app.get('/api/health', (_req,res)=>res.json({status:'ok',service:'TransitOps API'}));
app.post('/api/auth/login', asyncRoute(async(req,res)=>{
  const {email,password}=parse(z.object({email:z.email(),password:z.string().min(8)}),req.body);
  const user=await db.user.findUnique({where:{email:email.toLowerCase()},include:{organization:true,driver:true}});
  if(!user || !user.passwordHash || !(await bcrypt.compare(password,user.passwordHash))) return res.status(401).json({message:'Email or password is incorrect'});
  if(!user.isActive) return res.status(403).json({message:'Your account has been suspended. Contact your company administrator.'});
  await db.user.update({where:{id:user.id},data:{lastLoginAt:new Date(),lastActiveAt:new Date()}});
  sendSession(res,user);
}));
app.post('/api/driver/auth/login',asyncRoute(async(req,res)=>{
  const {email,password}=parse(z.object({email:z.email(),password:z.string().min(8)}),req.body);
  const user=await db.user.findUnique({where:{email:email.toLowerCase()},include:{organization:true,driver:true}});
  if(!user||!user.passwordHash||!(await bcrypt.compare(password,user.passwordHash)))return res.status(401).json({message:'Email or password is incorrect'});
  if(!user.isActive)return res.status(403).json({message:'Your account has been suspended. Contact your company administrator.'});
  if(user.role!==Role.DRIVER||!user.driver)return res.status(403).json({message:'A linked Driver account is required for mobile driver access'});
  const session=publicUser(user),token=jwt.sign({...session,sessionVersion:user.sessionVersion},SECRET,{expiresIn:'24h'});
  await db.user.update({where:{id:user.id},data:{lastLoginAt:new Date(),lastActiveAt:new Date()}});
  res.setHeader('Cache-Control','no-store');res.json({token,user:session});
}));
app.post('/api/auth/register', asyncRoute(async(req,res)=>{
  const {name,email,password,companyName}=parse(z.object({name:z.string().trim().min(2).max(80),email:z.email(),password:passwordSchema,companyName:z.string().trim().min(2).max(100)}),req.body);
  const normalizedEmail=email.toLowerCase();
  if(await db.user.findUnique({where:{email:normalizedEmail}})) return res.status(409).json({message:'An account already exists for this email'});
  const base=slugify(companyName)||'company'; let slug=base; let suffix=1;
  while(await db.organization.findUnique({where:{slug}})) slug=`${base}-${++suffix}`;
  const user=await db.$transaction(async tx=>{
    const organization=await tx.organization.create({data:{name:companyName,slug,operationsEmail:normalizedEmail}});
    return tx.user.create({data:{name,email:normalizedEmail,passwordHash:await bcrypt.hash(password,12),role:Role.OWNER,organizationId:organization.id,lastLoginAt:new Date(),lastActiveAt:new Date()},include:{organization:true,driver:true}});
  });
  sendSession(res,user,201);
}));
app.post('/api/auth/google', asyncRoute(async(req,res)=>{
  if(!GOOGLE_CLIENT_ID) return res.status(503).json({message:'Google sign-in is not configured yet'});
  const {credential,intent,companyName}=parse(z.object({credential:z.string().min(20),intent:z.enum(['login','register']),companyName:z.string().trim().min(2).max(100).optional()}),req.body);
  const ticket=await googleClient.verifyIdToken({idToken:credential,audience:GOOGLE_CLIENT_ID}); const payload=ticket.getPayload();
  if(!payload?.sub||!payload.email||!payload.email_verified) return res.status(401).json({message:'Google could not verify this email'});
  const email=payload.email.toLowerCase(); let user=await db.user.findUnique({where:{email},include:{organization:true,driver:true}});
  if(!user){
    if(intent!=='register'||!companyName) return res.status(404).json({message:'No FleetPilot account found. Create your company workspace first.'});
    const base=slugify(companyName)||'company'; let slug=base; let suffix=1; while(await db.organization.findUnique({where:{slug}}))slug=`${base}-${++suffix}`;
    user=await db.$transaction(async tx=>{const organization=await tx.organization.create({data:{name:companyName,slug,operationsEmail:email}});return tx.user.create({data:{name:payload.name||email.split('@')[0],email,googleSub:payload.sub,role:Role.OWNER,organizationId:organization.id,lastLoginAt:new Date(),lastActiveAt:new Date()},include:{organization:true,driver:true}})});
  } else {
    if(!user.isActive)return res.status(403).json({message:'Your account has been suspended. Contact your company administrator.'});
    if(user.googleSub&&user.googleSub!==payload.sub)return res.status(409).json({message:'This email is linked to another Google identity'});
    user=await db.user.update({where:{id:user.id},data:{googleSub:payload.sub,lastLoginAt:new Date(),lastActiveAt:new Date()},include:{organization:true,driver:true}});
  }
  sendSession(res,user);
}));
app.post('/api/driver/auth/register',(_req,res)=>res.status(410).json({message:'Driver accounts are created by the company in User Access. Use the credentials provided by your fleet manager.'}));
app.post('/api/auth/forgot-password',forgotIpLimit,forgotEmailLimit,asyncRoute(async(req,res)=>{
  const {email}=parse(z.object({email:z.email()}),req.body);
  const requestId=randomUUID();res.setHeader('X-Request-Id',requestId);
  try { const userId=await passwordResetService.request(email);authAudit('password_reset_requested',requestId,userId?'issued':'ignored',userId||undefined); }
  catch(error) { authAudit('password_reset_requested',requestId,'delivery_failed');console.error('Password-reset delivery failed:',error instanceof Error?error.message:'Unknown error'); }
  res.setHeader('Cache-Control','no-store');
  res.status(202).json({message:'If an account exists for that email, password-reset instructions have been sent.'});
}));
app.post('/api/auth/reset-password',resetIpLimit,asyncRoute(async(req,res)=>{
  const {token,password}=parse(z.object({token:z.string().min(32).max(200),password:passwordSchema}),req.body);
  const requestId=randomUUID();res.setHeader('X-Request-Id',requestId);
  const userId=await passwordResetService.reset(token,password);
  authAudit('password_reset_completed',requestId,'completed',userId);
  res.clearCookie(SESSION_COOKIE,clearCookieOptions);
  res.setHeader('Cache-Control','no-store');
  res.json({message:'Your password has been reset. Please sign in.'});
}));
app.post('/api/auth/logout',(_req,res)=>{res.clearCookie(SESSION_COOKIE,clearCookieOptions);res.status(204).end()});
app.get('/api/auth/me',authenticate,(req,res)=>{res.setHeader('Cache-Control','no-store');res.json({user:req.user})});

app.use('/api',authenticate);
app.post('/api/auth/change-password',asyncRoute(async(req,res)=>{
  const {currentPassword,newPassword}=parse(z.object({currentPassword:z.string().min(8),newPassword:passwordSchema}),req.body);
  const account=await db.user.findUnique({where:{id:req.user!.id}});
  if(!account?.passwordHash||!(await bcrypt.compare(currentPassword,account.passwordHash)))return res.status(401).json({message:'Current password is incorrect'});
  const user=await db.user.update({where:{id:account.id},data:{passwordHash:await bcrypt.hash(newPassword,12),mustChangePassword:false,sessionVersion:{increment:1}},include:{organization:true,driver:true}});
  const session=publicUser(user);res.cookie(SESSION_COOKIE,jwt.sign({...session,sessionVersion:user.sessionVersion},SECRET,{expiresIn:'8h'}),cookieOptions);res.setHeader('Cache-Control','no-store');
  res.json({user:session,...(session.role===Role.DRIVER?{token:jwt.sign({...session,sessionVersion:user.sessionVersion},SECRET,{expiresIn:'24h'})}:{})});
}));
app.use('/api/chat',createChatRouter(db));
app.get('/api/profile',asyncRoute(async(req,res)=>res.json(await profileResponse(req.user!.id))));
app.get('/api/search',asyncRoute(async(req,res)=>{
  const query=String(req.query.q||'').trim().slice(0,80);
  if(query.length<2)return res.json({query,results:[]});
  const organizationId=req.user!.organizationId,role=req.user!.role;
  const privileged=role===Role.OWNER||role===Role.ADMIN;
  const canSearchVehicles=privileged||role===Role.FLEET_MANAGER;
  const canSearchDrivers=privileged||role===Role.FLEET_MANAGER||role===Role.SAFETY_OFFICER;
  const canSearchTrips=privileged||role===Role.FLEET_MANAGER||role===Role.DISPATCHER;
  const [drivers,vehicles,trips]=await Promise.all([
    canSearchDrivers?db.driver.findMany({where:{organizationId,OR:[{name:{contains:query,mode:'insensitive'}},{contact:{contains:query,mode:'insensitive'}},{licenseNo:{contains:query,mode:'insensitive'}}]},select:{id:true,name:true,contact:true,licenseNo:true,status:true},orderBy:{name:'asc'},take:5}):Promise.resolve([]),
    canSearchVehicles?db.vehicle.findMany({where:{organizationId,OR:[{name:{contains:query,mode:'insensitive'}},{registrationNo:{contains:query,mode:'insensitive'}},{type:{contains:query,mode:'insensitive'}}]},select:{id:true,name:true,registrationNo:true,type:true,status:true},orderBy:{name:'asc'},take:5}):Promise.resolve([]),
    canSearchTrips?db.trip.findMany({where:{organizationId,OR:[{tripNo:{contains:query,mode:'insensitive'}},{source:{contains:query,mode:'insensitive'}},{destination:{contains:query,mode:'insensitive'}},{driver:{name:{contains:query,mode:'insensitive'}}},{vehicle:{name:{contains:query,mode:'insensitive'}}},{vehicle:{registrationNo:{contains:query,mode:'insensitive'}}}]},select:{id:true,tripNo:true,source:true,destination:true,status:true,driver:{select:{name:true}},vehicle:{select:{name:true}}},orderBy:{createdAt:'desc'},take:5}):Promise.resolve([])
  ]);
  const results=[
    ...drivers.map(driver=>({type:'DRIVER' as const,id:driver.id,title:driver.name,subtitle:`${driver.contact} · ${driver.licenseNo}`,meta:driver.status})),
    ...vehicles.map(vehicle=>({type:'VEHICLE' as const,id:vehicle.id,title:vehicle.name,subtitle:`${vehicle.registrationNo} · ${vehicle.type}`,meta:vehicle.status})),
    ...trips.map(trip=>({type:'TRIP' as const,id:trip.id,title:trip.tripNo,subtitle:`${trip.source} → ${trip.destination}`,meta:trip.status,context:`${trip.vehicle.name} · ${trip.driver.name}`}))
  ];
  res.setHeader('Cache-Control','private, max-age=15');
  res.json({query,results});
}));
app.patch('/api/profile',asyncRoute(async(req,res)=>{
  const data=parse(z.object({name:z.string().trim().min(2).max(80),phone:z.string().trim().max(30).optional(),jobTitle:z.string().trim().max(80).optional()}),req.body);
  await db.user.update({where:{id:req.user!.id},data:{name:data.name,phone:data.phone||null,jobTitle:data.jobTitle||null}});
  res.json(await profileResponse(req.user!.id));
}));
app.post('/api/profile/avatar',avatarUpload.single('avatar'),asyncRoute(async(req,res)=>{
  if(!req.file)return res.status(400).json({message:'Choose a JPG, PNG, WebP or HEIC image up to 20 MB'});
  const avatarKey=await uploadPrivateObject({organizationId:req.user!.organizationId,folder:`users/${req.user!.id}/avatar`,originalName:req.file.originalname,mimeType:imageMimeType(req.file)!,buffer:req.file.buffer});
  await db.user.update({where:{id:req.user!.id},data:{avatarKey}});
  res.json(await profileResponse(req.user!.id));
}));
app.get('/api/driver/me',driverOnly,asyncRoute(async(req,res)=>res.json(await driverProfileResponse(req.user!.driverId!,req.user!.organizationId))));
app.get('/api/driver/me/trips',driverOnly,asyncRoute(async(req,res)=>{
  if(req.user!.mustChangePassword)return res.status(403).json({message:'Change your temporary password before opening trip assignments'});
  res.json(await db.trip.findMany({where:{driverId:req.user!.driverId!,organizationId:req.user!.organizationId,status:{in:[TripStatus.DISPATCHED,TripStatus.IN_PROGRESS,TripStatus.COMPLETED]}},include:{vehicle:true,driver:true},orderBy:[{dispatchedAt:'desc'},{createdAt:'desc'}],take:50}));
}));
app.get('/api/driver/me/trips/:id',driverOnly,asyncRoute(async(req,res)=>{
  if(req.user!.mustChangePassword)return res.status(403).json({message:'Change your temporary password before opening trip assignments'});
  const trip=await db.trip.findFirst({where:{id:idParam(req),driverId:req.user!.driverId!,organizationId:req.user!.organizationId},include:{vehicle:true,driver:true}});
  if(!trip)throw Object.assign(new Error('Assigned trip not found'),{status:404});
  const latestLocation=await db.tripLocation.findFirst({where:{tripId:trip.id,driverId:req.user!.driverId!},orderBy:{capturedAt:'desc'},select:{latitude:true,longitude:true,accuracyM:true,capturedAt:true}});
  res.json({...trip,tracking:{status:trackingStatus(trip.status,latestLocation?.capturedAt),latestLocation}});
}));
app.post('/api/driver/me/onboarding',driverOnly,driverDocumentUpload.fields([{name:'profilePhoto',maxCount:1},{name:'licenseFront',maxCount:1},{name:'licenseBack',maxCount:1}]),asyncRoute(async(req,res)=>{
  if(req.user!.mustChangePassword)return res.status(403).json({message:'Change your temporary password before uploading documents'});
  const files=req.files as {[fieldname:string]:Express.Multer.File[]}|undefined;
  const profilePhoto=files?.profilePhoto?.[0];const licenseFront=files?.licenseFront?.[0];const licenseBack=files?.licenseBack?.[0];
  if(!profilePhoto||!licenseFront)return res.status(400).json({message:'Profile photo and driving licence front are required'});
  const uploads:[DriverDocumentType,Express.Multer.File][]=[[DriverDocumentType.PROFILE_PHOTO,profilePhoto],[DriverDocumentType.LICENSE_FRONT,licenseFront],...(licenseBack?[[DriverDocumentType.LICENSE_BACK,licenseBack] as [DriverDocumentType,Express.Multer.File]]:[])];
  await Promise.all(uploads.map(async([type,file])=>{
    const mimeType=imageMimeType(file)!;
    const objectKey=await uploadPrivateObject({organizationId:req.user!.organizationId,folder:`drivers/${req.user!.driverId}/documents`,originalName:file.originalname,mimeType,buffer:file.buffer});
    await db.driverDocument.upsert({where:{driverId_type:{driverId:req.user!.driverId!,type}},create:{organizationId:req.user!.organizationId,driverId:req.user!.driverId!,type,objectKey,originalName:file.originalname,mimeType,size:file.size},update:{objectKey,originalName:file.originalname,mimeType,size:file.size,createdAt:new Date()}});
  }));
  await db.driver.update({where:{id:req.user!.driverId!},data:{onboardingStatus:DriverOnboardingStatus.PENDING,reviewNote:null}});
  let ocr:{name?:string;licenseNo?:string;licenseCategory?:string;licenseExpiry?:string;confidence:number};
  try { const result=await extractDrivingLicense(licenseFront.buffer);ocr={name:result.name,licenseNo:result.licenseNo,licenseCategory:result.licenseCategory,licenseExpiry:result.licenseExpiry,confidence:result.confidence}; }
  catch { ocr={confidence:0}; }
  res.json({profile:await driverProfileResponse(req.user!.driverId!,req.user!.organizationId),ocr});
}));
app.post('/api/driver/me/onboarding/confirm',driverOnly,asyncRoute(async(req,res)=>{
  if(req.user!.mustChangePassword)return res.status(403).json({message:'Change your temporary password before submitting your profile'});
  const data=parse(z.object({name:z.string().trim().min(2).max(80),contact:z.string().trim().min(7).max(30),licenseNo:z.string().trim().min(3).max(40),licenseCategory:z.enum(LicenseCategory),licenseExpiry:z.coerce.date().refine(date=>date>new Date(),'Driving licence must not be expired')}),req.body);
  const required=await db.driverDocument.count({where:{driverId:req.user!.driverId!,type:{in:[DriverDocumentType.PROFILE_PHOTO,DriverDocumentType.LICENSE_FRONT]}}});
  if(required<2)return res.status(409).json({message:'Upload your profile photo and driving licence front before submitting'});
  await db.$transaction([
    db.driver.update({where:{id:req.user!.driverId!},data:{...data,onboardingStatus:DriverOnboardingStatus.NEEDS_REVIEW,status:DriverStatus.OFF_DUTY,reviewNote:null}}),
    db.user.update({where:{id:req.user!.id},data:{name:data.name,phone:data.contact}})
  ]);
  res.json(await driverProfileResponse(req.user!.driverId!,req.user!.organizationId));
}));
app.get('/api/driver/me/dashboard',driverOnly,asyncRoute(async(req,res)=>res.json(await driverDashboardResponse(req.user!.driverId!,req.user!.organizationId))));
app.post('/api/driver/me/expenses/receipt',driverOnly,driverReceiptUpload.single('receipt'),asyncRoute(async(req,res)=>{
  if(req.user!.mustChangePassword)return res.status(403).json({message:'Change your temporary password before submitting expenses'});
  if(!req.file)return res.status(400).json({message:'Take or choose a JPG, PNG, WebP or HEIC receipt image up to 20 MB'});
  const driver=await db.driver.findFirst({where:{id:req.user!.driverId!,organizationId:req.user!.organizationId}});
  if(!driver||driver.onboardingStatus!==DriverOnboardingStatus.VERIFIED)return res.status(403).json({message:'Your driver profile must be approved before submitting expenses'});
  const fields=parse(z.object({vehicleId:z.string().optional(),type:z.enum(ExpenseType).optional(),description:z.string().trim().max(240).optional()}),req.body);
  const trip=fields.vehicleId
    ? await db.trip.findFirst({where:{driverId:driver.id,organizationId:req.user!.organizationId,vehicleId:fields.vehicleId},include:{vehicle:true},orderBy:{createdAt:'desc'}})
    : await db.trip.findFirst({where:{driverId:driver.id,organizationId:req.user!.organizationId,status:TripStatus.DISPATCHED},include:{vehicle:true},orderBy:{dispatchedAt:'desc'}})
      || await db.trip.findFirst({where:{driverId:driver.id,organizationId:req.user!.organizationId,status:TripStatus.COMPLETED},include:{vehicle:true},orderBy:{completedAt:'desc'}});
  if(!trip)return res.status(409).json({message:fields.vehicleId?'That vehicle has not been assigned to this driver':'No assigned trip was found for this expense'});
  const ocr=await extractReceipt(req.file.buffer);
  if(!ocr.amount)return res.status(422).json({message:'The receipt total could not be read. Retake the photo in good light with the full receipt visible.'});
  const mimeType=imageMimeType(req.file)!;
  const receiptObjectKey=await uploadPrivateObject({organizationId:req.user!.organizationId,folder:`drivers/${driver.id}/receipts`,originalName:req.file.originalname,mimeType,buffer:req.file.buffer});
  const description=[fields.description,ocr.vendor,`Submitted by ${driver.name}`].filter(Boolean).join(' · ');
  const expense=await db.expense.create({data:{organizationId:req.user!.organizationId,tripId:trip.id,vehicleId:trip.vehicleId,driverId:driver.id,type:(fields.type||ocr.expenseType) as ExpenseType,description:description||undefined,amount:ocr.amount,date:ocr.date?new Date(ocr.date):new Date(),receiptObjectKey,receiptName:req.file.originalname,receiptMimeType:mimeType,ocrConfidence:ocr.confidence},include:{vehicle:true,submittedByDriver:{select:{id:true,name:true}}}});
  res.status(201).json({expense:await expenseResponse(expense),ocr:{amount:ocr.amount,date:ocr.date,vendor:ocr.vendor,expenseType:fields.type||ocr.expenseType,confidence:ocr.confidence}});
}));
app.get('/api/organization',asyncRoute(async(req,res)=>res.json(await db.organization.findUnique({where:{id:req.user!.organizationId}}))));
app.put('/api/organization',allow(Role.OWNER,Role.ADMIN),asyncRoute(async(req,res)=>{const data=parse(z.object({name:z.string().trim().min(2).max(100),operationsEmail:z.email().optional()}),req.body);res.json(await db.organization.update({where:{id:req.user!.organizationId},data}))}));
app.get('/api/users',allow(Role.OWNER,Role.ADMIN),asyncRoute(async(req,res)=>{
  const users=await db.user.findMany({where:{organizationId:req.user!.organizationId},select:{id:true,name:true,email:true,role:true,isActive:true,lastLoginAt:true,lastActiveAt:true,createdAt:true,googleSub:true,driver:{select:{id:true,licenseNo:true,licenseCategory:true,licenseExpiry:true,onboardingStatus:true,reviewNote:true,status:true,payType:true,payRate:true,createdAt:true,documents:{select:{id:true,type:true,originalName:true,mimeType:true,size:true,createdAt:true},orderBy:{createdAt:'desc'}}}}},orderBy:{createdAt:'asc'}});
  res.json(users);
}));
const teamAccessSchema=z.object({name:z.string().trim().min(2).max(80),email:z.email(),password:passwordSchema,role:z.enum(Role).refine(role=>role!==Role.OWNER&&role!==Role.DRIVER,'Driver accounts must be created from Driver Access')});
const driverAccessSchema=z.object({name:z.string().trim().min(2).max(80),email:z.email(),password:passwordSchema,contact:z.string().trim().min(7).max(30),payType:z.enum(DriverPayType).default(DriverPayType.PER_TRIP),payRate:z.coerce.number().nonnegative().default(0)});
app.post('/api/users',allow(Role.OWNER,Role.ADMIN),asyncRoute(async(req,res)=>{
  const {name,email,password,role}=parse(teamAccessSchema,req.body);
  if(req.user!.role===Role.ADMIN&&role===Role.ADMIN)return res.status(403).json({message:'Only the Owner can add another Admin'});
  const passwordHash=await bcrypt.hash(password,12);
  const user=await db.user.create({data:{name,email:email.toLowerCase(),passwordHash,role,organizationId:req.user!.organizationId}});
  res.status(201).json({id:user.id,name:user.name,email:user.email,role:user.role,isActive:user.isActive,createdAt:user.createdAt});
}));
app.post('/api/driver-access',allow(Role.OWNER,Role.ADMIN,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{
  const {name,email,password,contact,payType,payRate}=parse(driverAccessSchema,req.body);
  const passwordHash=await bcrypt.hash(password,12);
  const user=await db.$transaction(async tx=>{
    const created=await tx.user.create({data:{name,email:email.toLowerCase(),phone:contact,passwordHash,role:Role.DRIVER,organizationId:req.user!.organizationId,mustChangePassword:true}});
    await tx.driver.create({data:{name,licenseNo:`PENDING-${created.id}`,licenseCategory:LicenseCategory.LMV,licenseExpiry:new Date(0),contact,payType,payRate,status:DriverStatus.OFF_DUTY,onboardingStatus:DriverOnboardingStatus.PENDING,organizationId:req.user!.organizationId,userId:created.id}});
    return created;
  });
  res.status(201).json({id:user.id,name:user.name,email:user.email,role:user.role,isActive:user.isActive,createdAt:user.createdAt});
}));
app.patch('/api/users/:id',allow(Role.OWNER,Role.ADMIN),asyncRoute(async(req,res)=>{const target=await db.user.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId}});if(!target)throw Object.assign(new Error('Team member not found'),{status:404});if(target.role===Role.OWNER)return res.status(403).json({message:'Owner access cannot be changed'});const data=parse(z.object({role:z.enum(Role).refine(r=>r!==Role.OWNER).optional(),isActive:z.boolean().optional(),password:passwordSchema.optional()}),req.body);if(req.user!.role===Role.ADMIN&&(target.role===Role.ADMIN||data.role===Role.ADMIN))return res.status(403).json({message:'Only the Owner can manage Admin access'});if(data.role&&data.role!==target.role&&(data.role===Role.DRIVER||target.role===Role.DRIVER))return res.status(409).json({message:'Driver access must be created as a new linked Driver account'});res.json(await db.user.update({where:{id:target.id},data:{role:data.role,isActive:data.isActive,...(data.password?{passwordHash:await bcrypt.hash(data.password,12),mustChangePassword:target.role===Role.DRIVER,sessionVersion:{increment:1}}:{})},select:{id:true,name:true,email:true,role:true,isActive:true,lastLoginAt:true,lastActiveAt:true,createdAt:true,googleSub:true}}))}));
app.get('/api/dashboard',asyncRoute(async(req,res)=>{
  const showRecentTrips=disclosurePolicyForRole(req.user!.role).recentTripDetails;
  const [vehicles,drivers,trips,recentTrips]=await Promise.all([
    db.vehicle.groupBy({by:['status'],where:{organizationId:req.user!.organizationId},_count:true}),db.driver.groupBy({by:['status'],where:{organizationId:req.user!.organizationId},_count:true}),db.trip.groupBy({by:['status'],where:{organizationId:req.user!.organizationId},_count:true}),
    showRecentTrips?db.trip.findMany({where:{organizationId:req.user!.organizationId},take:6,orderBy:{createdAt:'desc'},select:{id:true,tripNo:true,source:true,destination:true,status:true,vehicle:{select:{name:true}},driver:{select:{name:true}}}}):Promise.resolve([])
  ]);
  const vc=Object.fromEntries(vehicles.map(x=>[x.status,x._count])); const dc=Object.fromEntries(drivers.map(x=>[x.status,x._count])); const tc=Object.fromEntries(trips.map(x=>[x.status,x._count]));
  const active=(vc.AVAILABLE||0)+(vc.ON_TRIP||0)+(vc.IN_SHOP||0); const utilized=vc.ON_TRIP||0;
  res.json({kpis:{activeVehicles:active,availableVehicles:vc.AVAILABLE||0,inMaintenance:vc.IN_SHOP||0,activeTrips:tc.DISPATCHED||0,pendingTrips:tc.DRAFT||0,driversOnDuty:dc.ON_TRIP||0,fleetUtilization:active?Math.round(utilized/active*100):0},vehicleStatus:vc,recentTrips});
}));

const vehicleSchema=z.object({registrationNo:z.string().min(3),name:z.string().min(2),type:z.string().min(2),capacityKg:z.coerce.number().positive(),requiredLicenseCategory:z.enum(LicenseCategory),odometerKm:z.coerce.number().nonnegative(),acquisitionCost:z.coerce.number().nonnegative(),status:z.enum(VehicleStatus).default(VehicleStatus.AVAILABLE),region:z.string().default('Central')});
app.get('/api/vehicles',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{
  const q=String(req.query.q||''); const status=req.query.status as VehicleStatus|undefined; const type=String(req.query.type||'');
  res.json(await db.vehicle.findMany({where:{AND:[{organizationId:req.user!.organizationId},q?{OR:[{registrationNo:{contains:q,mode:'insensitive'}},{name:{contains:q,mode:'insensitive'}}]}:{},status?{status}:{},type?{type}:{ }]},orderBy:{createdAt:'desc'}}));
}));
app.get('/api/vehicles/available',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>res.json(await db.vehicle.findMany({where:{organizationId:req.user!.organizationId,status:VehicleStatus.AVAILABLE},orderBy:{name:'asc'}}))));
app.get('/api/vehicles/:id/details',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{
  const vehicle=await db.vehicle.findFirst({
    where:{id:idParam(req),organizationId:req.user!.organizationId},
    include:{
      trips:{include:{driver:true},orderBy:{createdAt:'desc'}},
      maintenance:{include:{driver:{select:{id:true,name:true}}},orderBy:{startDate:'desc'}},
      fuelLogs:{include:{driver:{select:{id:true,name:true}}},orderBy:{date:'desc'}},
      expenses:{include:{submittedByDriver:{select:{id:true,name:true}}},orderBy:{date:'desc'}}
    }
  });
  if(!vehicle)throw Object.assign(new Error('Vehicle not found'),{status:404});
  const completedTrips=vehicle.trips.filter(trip=>trip.status===TripStatus.COMPLETED);
  const activeTrip=vehicle.trips.find(trip=>trip.status===TripStatus.DISPATCHED)||null;
  const driverUsage=Array.from(vehicle.trips.reduce((drivers,trip)=>{
    const current=drivers.get(trip.driverId)||{driver:trip.driver,tripCount:0,completedTrips:0,totalDistanceKm:0,lastUsedAt:trip.createdAt};
    current.tripCount+=1;
    if(trip.status===TripStatus.COMPLETED){current.completedTrips+=1;current.totalDistanceKm+=trip.plannedDistanceKm;}
    if(trip.createdAt>current.lastUsedAt)current.lastUsedAt=trip.createdAt;
    drivers.set(trip.driverId,current);
    return drivers;
  },new Map<string,{driver:(typeof vehicle.trips)[number]['driver'];tripCount:number;completedTrips:number;totalDistanceKm:number;lastUsedAt:Date}>()).values()).sort((a,b)=>b.lastUsedAt.getTime()-a.lastUsedAt.getTime());
  res.json({
    vehicle:{id:vehicle.id,registrationNo:vehicle.registrationNo,name:vehicle.name,type:vehicle.type,capacityKg:vehicle.capacityKg,requiredLicenseCategory:vehicle.requiredLicenseCategory,odometerKm:vehicle.odometerKm,acquisitionCost:vehicle.acquisitionCost,status:vehicle.status,region:vehicle.region,createdAt:vehicle.createdAt},
    summary:{totalTrips:vehicle.trips.length,completedTrips:completedTrips.length,totalDistanceKm:completedTrips.reduce((sum,trip)=>sum+trip.plannedDistanceKm,0),maintenanceCost:vehicle.maintenance.reduce((sum,item)=>sum+item.cost,0),fuelCost:vehicle.fuelLogs.reduce((sum,item)=>sum+item.cost,0),fuelLiters:vehicle.fuelLogs.reduce((sum,item)=>sum+item.liters,0),otherExpenses:vehicle.expenses.reduce((sum,item)=>sum+item.amount,0)},
    activeTrip,driverUsage,trips:vehicle.trips,maintenance:vehicle.maintenance,fuelLogs:vehicle.fuelLogs,expenses:vehicle.expenses
  });
}));
app.post('/api/vehicles',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>res.status(201).json(await db.vehicle.create({data:{...parse(vehicleSchema,req.body),organizationId:req.user!.organizationId}}))));
app.put('/api/vehicles/:id',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const row=await db.vehicle.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId}});if(!row)throw Object.assign(new Error('Vehicle not found'),{status:404});res.json(await db.vehicle.update({where:{id:row.id},data:parse(vehicleSchema.partial(),req.body)}))}));
app.delete('/api/vehicles/:id',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const row=await db.vehicle.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId}});if(!row)throw Object.assign(new Error('Vehicle not found'),{status:404});await db.vehicle.delete({where:{id:row.id}});res.status(204).end();}));

const driverSchema=z.object({name:z.string().min(2),licenseNo:z.string().min(3),licenseCategory:z.enum(LicenseCategory),licenseExpiry:z.coerce.date(),contact:z.string().min(7),payType:z.enum(DriverPayType).default(DriverPayType.PER_TRIP),payRate:z.coerce.number().nonnegative().default(0),safetyScore:z.coerce.number().int().min(0).max(100),status:z.enum(DriverStatus).default(DriverStatus.AVAILABLE)});
app.get('/api/drivers',allow(Role.FLEET_MANAGER,Role.SAFETY_OFFICER),asyncRoute(async(req,res)=>{const q=String(req.query.q||'');res.json(await db.driver.findMany({where:{organizationId:req.user!.organizationId,...(q?{OR:[{name:{contains:q,mode:'insensitive'}},{licenseNo:{contains:q,mode:'insensitive'}}]}:{})},orderBy:{createdAt:'desc'}}));}));
app.get('/api/drivers/available',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>res.json(await db.driver.findMany({where:{organizationId:req.user!.organizationId,status:DriverStatus.AVAILABLE,onboardingStatus:DriverOnboardingStatus.VERIFIED,licenseExpiry:{gt:new Date()}},orderBy:{name:'asc'}}))));
app.get('/api/drivers/performance',allow(Role.FLEET_MANAGER,Role.SAFETY_OFFICER,Role.FINANCIAL_ANALYST),asyncRoute(async(req,res)=>{
  const organizationId=req.user!.organizationId;
  const [drivers,trips,expenses]=await Promise.all([
    db.driver.findMany({where:{organizationId},include:{user:{select:{email:true}},documents:{select:{type:true,createdAt:true},orderBy:{createdAt:'desc'}}},orderBy:{name:'asc'}}),
    db.trip.findMany({where:{organizationId},select:{driverId:true,status:true,revenue:true,plannedDistanceKm:true,createdAt:true,dispatchedAt:true,completedAt:true}}),
    db.expense.findMany({where:{organizationId,driverId:{not:null}},select:{driverId:true,amount:true,date:true}})
  ]);
  res.json(drivers.map(driver=>{
    const driverTrips=trips.filter(trip=>trip.driverId===driver.id),driverExpenses=expenses.filter(expense=>expense.driverId===driver.id);
    const driverCost=driverExpenses.reduce((sum,expense)=>sum+expense.amount,0);
    const lastTripAt=driverTrips.map(trip=>trip.completedAt||trip.dispatchedAt||trip.createdAt).sort((a,b)=>b.getTime()-a.getTime())[0]||null;
    return {driverId:driver.id,name:driver.name,email:driver.user?.email||null,onboardingStatus:driver.onboardingStatus,status:driver.status,payType:driver.payType,payRate:driver.payRate,tripCount:driverTrips.length,completedTrips:driverTrips.filter(trip=>trip.status===TripStatus.COMPLETED).length,activeTrips:driverTrips.filter(trip=>trip.status===TripStatus.DISPATCHED).length,distanceKm:driverTrips.reduce((sum,trip)=>sum+trip.plannedDistanceKm,0),revenue:driverTrips.reduce((sum,trip)=>sum+trip.revenue,0),driverCost,documentsUpdated:driver.documents.length,documentsRequired:2,lastDocumentAt:driver.documents[0]?.createdAt||null,lastTripAt};
  }));
}));
app.get('/api/drivers/:id/details',allow(Role.FLEET_MANAGER,Role.SAFETY_OFFICER),asyncRoute(async(req,res)=>{
  const driver=await db.driver.findFirst({
    where:{id:idParam(req),organizationId:req.user!.organizationId},
    include:{
      user:{select:{email:true,isActive:true,lastActiveAt:true,createdAt:true}},
      documents:{orderBy:{createdAt:'desc'}},
      trips:{select:{id:true,tripNo:true,source:true,destination:true,status:true,plannedDistanceKm:true,revenue:true,createdAt:true,completedAt:true,vehicle:{select:{name:true,registrationNo:true}}},orderBy:{createdAt:'desc'},take:10}
    }
  });
  if(!driver)throw Object.assign(new Error('Driver not found'),{status:404});
  const documents=await Promise.all(driver.documents.map(async document=>({id:document.id,type:document.type,originalName:document.originalName,mimeType:document.mimeType,size:document.size,createdAt:document.createdAt,url:objectStorageConfigured()?await signedObjectUrl(document.objectKey,900):null})));
  const {documents:_documents,...details}=driver;
  res.json({...details,documents});
}));
app.post('/api/drivers',allow(Role.FLEET_MANAGER,Role.SAFETY_OFFICER),(_req,res)=>res.status(410).json({message:'Create drivers from the Driver Access module so every driver has a secure linked account.'}));
app.get('/api/drivers/:id/onboarding',allow(Role.FLEET_MANAGER,Role.SAFETY_OFFICER),asyncRoute(async(req,res)=>{
  const driver=await db.driver.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId}});
  if(!driver)throw Object.assign(new Error('Driver not found'),{status:404});
  res.json(await driverProfileResponse(driver.id,req.user!.organizationId));
}));
app.post('/api/drivers/:id/onboarding/approve',allow(Role.FLEET_MANAGER,Role.SAFETY_OFFICER),asyncRoute(async(req,res)=>{
  const driver=await db.driver.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId},include:{documents:true}});
  if(!driver)throw Object.assign(new Error('Driver not found'),{status:404});
  if(driver.onboardingStatus!==DriverOnboardingStatus.NEEDS_REVIEW)return res.status(409).json({message:'This driver has not submitted a profile for review'});
  if(!driver.documents.some(document=>document.type===DriverDocumentType.PROFILE_PHOTO)||!driver.documents.some(document=>document.type===DriverDocumentType.LICENSE_FRONT))return res.status(409).json({message:'Required driver documents are missing'});
  res.json(await db.driver.update({where:{id:driver.id},data:{onboardingStatus:DriverOnboardingStatus.VERIFIED,status:DriverStatus.AVAILABLE,reviewNote:null}}));
}));
app.post('/api/drivers/:id/onboarding/reject',allow(Role.FLEET_MANAGER,Role.SAFETY_OFFICER),asyncRoute(async(req,res)=>{
  const {reviewNote}=parse(z.object({reviewNote:z.string().trim().min(3).max(500)}),req.body);
  const driver=await db.driver.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId}});
  if(!driver)throw Object.assign(new Error('Driver not found'),{status:404});
  res.json(await db.driver.update({where:{id:driver.id},data:{onboardingStatus:DriverOnboardingStatus.REJECTED,status:DriverStatus.OFF_DUTY,reviewNote}}));
}));
app.put('/api/drivers/:id',allow(Role.FLEET_MANAGER,Role.SAFETY_OFFICER),asyncRoute(async(req,res)=>{const row=await db.driver.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId}});if(!row)throw Object.assign(new Error('Driver not found'),{status:404});res.json(await db.driver.update({where:{id:row.id},data:parse(driverSchema.partial(),req.body)}))}));
app.delete('/api/drivers/:id',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const row=await db.driver.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId}});if(!row)throw Object.assign(new Error('Driver not found'),{status:404});if(row.userId)return res.status(409).json({message:'Linked mobile drivers must be suspended from User Access instead of deleted'});await db.driver.delete({where:{id:row.id}});res.status(204).end();}));

const tripSchema=z.object({source:z.string().min(2),destination:z.string().min(2),vehicleId:z.string(),driverId:z.string(),cargoWeightKg:z.coerce.number().positive(),plannedDistanceKm:z.coerce.number().positive(),revenue:z.coerce.number().nonnegative().default(0),estimatedTollsInr:z.union([z.null(),z.coerce.number().nonnegative()]).optional().default(null),estimatedDurationMin:z.coerce.number().int().positive().optional(),routeSummary:z.string().max(300).optional(),routeProvider:z.enum(['GOOGLE','VALHALLA']).optional(),tollEstimateStatus:z.enum(['ESTIMATED','HISTORICAL_ESTIMATE','NO_TOLLS_EXPECTED','TOLLS_PRESENT_PRICE_UNKNOWN','UNAVAILABLE']).optional(),routeEstimatedAt:z.coerce.date().optional()});
const tripLocationPointSchema=z.object({clientRequestId:z.string().trim().min(8).max(100),latitude:z.number().finite().min(-90).max(90),longitude:z.number().finite().min(-180).max(180),accuracyM:z.number().finite().nonnegative().max(5000),speedKph:z.number().finite().nonnegative().max(300).optional(),headingDeg:z.number().finite().min(0).max(360).optional(),altitudeM:z.number().finite().min(-500).max(10000).optional(),batteryPct:z.number().int().min(0).max(100).optional(),isMocked:z.boolean().optional(),capturedAt:z.coerce.date()});
async function tripLocationSnapshot(tripId:string,organizationId:string){
  const trip=await db.trip.findFirst({where:{id:tripId,organizationId},select:{id:true,tripNo:true,status:true,source:true,destination:true,sourceLatitude:true,sourceLongitude:true,destinationLatitude:true,destinationLongitude:true,routePolyline:true,driver:{select:{id:true,name:true,contact:true}},vehicle:{select:{id:true,name:true,registrationNo:true}}}});
  if(!trip)throw Object.assign(new Error('Trip not found'),{status:404});
  const newest=await db.tripLocation.findMany({where:{tripId,organizationId},orderBy:{capturedAt:'desc'},take:100,select:{id:true,latitude:true,longitude:true,accuracyM:true,speedKph:true,headingDeg:true,altitudeM:true,batteryPct:true,isMocked:true,capturedAt:true,receivedAt:true}});
  const latestLocation=newest[0]||null;
  return {trip,trackingStatus:trackingStatus(trip.status,latestLocation?.capturedAt),latestLocation,history:newest.reverse(),serverTime:new Date()};
}
app.get('/api/trips',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>res.json(await db.trip.findMany({where:{organizationId:req.user!.organizationId},include:{vehicle:true,driver:true},orderBy:{createdAt:'desc'}}))));
app.post('/api/driver/me/trips/:id/locations',driverOnly,asyncRoute(async(req,res)=>{
  if(req.user!.mustChangePassword)return res.status(403).json({message:'Change your temporary password before sharing trip location'});
  const driver=await db.driver.findFirst({where:{id:req.user!.driverId!,organizationId:req.user!.organizationId}});
  if(!driver||driver.onboardingStatus!==DriverOnboardingStatus.VERIFIED)return res.status(403).json({message:'Your driver profile must be approved before sharing trip location'});
  const trip=await db.trip.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId,driverId:driver.id}});
  if(!trip)throw Object.assign(new Error('This trip is not assigned to the authenticated driver'),{status:404});
  if(trip.status!==TripStatus.DISPATCHED&&trip.status!==TripStatus.IN_PROGRESS)return res.status(409).json({message:'Live location is accepted only for a dispatched or in-progress trip'});
  const {points}=parse(z.object({points:z.array(tripLocationPointSchema).min(1).max(50)}),req.body);
  const dispatchStartedAt=trip.dispatchedAt||trip.createdAt;
  if(points.some(point=>!locationTimestampBelongsToDispatch(point.capturedAt,dispatchStartedAt)))return res.status(422).json({message:'Location timestamps must belong to this dispatch and cannot be more than five minutes in the future'});
  const created=await db.tripLocation.createMany({data:points.map(point=>({organizationId:req.user!.organizationId,tripId:trip.id,driverId:driver.id,...point})),skipDuplicates:true});
  const currentStatus=created.count>0&&trip.status===TripStatus.DISPATCHED
    ?(await db.trip.update({where:{id:trip.id},data:{status:TripStatus.IN_PROGRESS,startedAt:trip.startedAt||new Date()}})).status
    :trip.status;
  const latestLocation=await db.tripLocation.findFirst({where:{tripId:trip.id,organizationId:req.user!.organizationId},orderBy:{capturedAt:'desc'},select:{id:true,latitude:true,longitude:true,accuracyM:true,speedKph:true,headingDeg:true,altitudeM:true,batteryPct:true,isMocked:true,capturedAt:true,receivedAt:true}});
  if(latestLocation)publishTripLocation(trip.id,{type:'LOCATION_UPDATE',tripId:trip.id,tripStatus:currentStatus,trackingStatus:trackingStatus(currentStatus,latestLocation.capturedAt),location:latestLocation,serverTime:new Date()});
  res.status(201).json({accepted:created.count,duplicates:points.length-created.count,tripStatus:currentStatus,latestLocation});
}));
app.get('/api/trips/:id/location',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>res.json(await tripLocationSnapshot(idParam(req),req.user!.organizationId))));
app.get('/api/trips/:id/location/stream',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{
  const snapshot=await tripLocationSnapshot(idParam(req),req.user!.organizationId);
  res.status(200);res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-cache, no-transform');res.setHeader('Connection','keep-alive');res.flushHeaders();
  res.write(`retry: 5000\ndata: ${JSON.stringify({type:'TRACKING_SNAPSHOT',...snapshot})}\n\n`);
  const streams=tripLocationStreams.get(snapshot.trip.id)||new Set<Response>();streams.add(res);tripLocationStreams.set(snapshot.trip.id,streams);
  const heartbeat=setInterval(()=>res.write(`: heartbeat ${Date.now()}\n\n`),15000);
  req.on('close',()=>{clearInterval(heartbeat);streams.delete(res);if(!streams.size)tripLocationStreams.delete(snapshot.trip.id)});
}));
app.get('/api/trips/:id',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{
  const trip=await db.trip.findFirst({
    where:{id:idParam(req),organizationId:req.user!.organizationId},
    include:{vehicle:true,driver:{include:{user:{select:{email:true,lastActiveAt:true}}}},expenses:{include:{vehicle:true,submittedByDriver:{select:{id:true,name:true}},fastagTransaction:{select:{id:true,providerTxnId:true,plazaName:true,lane:true,status:true}}},orderBy:{date:'desc'}},fuelLogs:{include:{driver:{select:{id:true,name:true}}},orderBy:{date:'desc'}},maintenance:{include:{driver:{select:{id:true,name:true}}},orderBy:{startDate:'desc'}},evidence:{include:{driver:{select:{id:true,name:true}}},orderBy:{createdAt:'desc'}}}
  });
  if(!trip)throw Object.assign(new Error('Trip not found'),{status:404});
  const expenses=await Promise.all(trip.expenses.map(async expense=>{const {receiptObjectKey,...safe}=expense;return {...safe,receiptOriginalName:expense.receiptName,receiptUrl:receiptObjectKey&&objectStorageConfigured()?await signedObjectUrl(receiptObjectKey,900):null}}));
  const fuelLogs=await Promise.all(trip.fuelLogs.map(async fuel=>{const {receiptObjectKey,...safe}=fuel;return {...safe,receiptOriginalName:fuel.receiptName,receiptUrl:receiptObjectKey&&objectStorageConfigured()?await signedObjectUrl(receiptObjectKey,900):null}}));
  const maintenance=await Promise.all(trip.maintenance.map(async item=>{const {objectKey,...safe}=item;return {...safe,photoOriginalName:item.originalName,photoUrl:objectKey&&objectStorageConfigured()?await signedObjectUrl(objectKey,900):null}}));
  const evidence=await Promise.all(trip.evidence.map(async item=>{const {objectKey,...safe}=item;return {...safe,url:objectKey&&objectStorageConfigured()?await signedObjectUrl(objectKey,900):null}}));
  const activityWindow={gte:trip.dispatchedAt||trip.createdAt,lte:trip.completedAt||new Date()};
  const [unallocatedExpenses,unallocatedFuel]=await Promise.all([db.expense.aggregate({where:{organizationId:trip.organizationId,vehicleId:trip.vehicleId,tripId:null,date:activityWindow},_count:true,_sum:{amount:true}}),db.fuelLog.aggregate({where:{organizationId:trip.organizationId,vehicleId:trip.vehicleId,tripId:null,date:activityWindow},_count:true,_sum:{cost:true}})]);
  const fuelCost=fuelLogs.reduce((sum,item)=>sum+item.cost,0),expenseCost=expenses.reduce((sum,item)=>sum+item.amount,0),maintenanceCost=maintenance.reduce((sum,item)=>sum+item.cost,0),actualCost=fuelCost+expenseCost+maintenanceCost,profit=trip.revenue-actualCost;
  const {expenses:_expenses,fuelLogs:_fuelLogs,maintenance:_maintenance,evidence:_evidence,...safeTrip}=trip;
  res.json({...safeTrip,expenses,fuelLogs,maintenance,evidence,financialSummary:{revenue:trip.revenue,fuelCost,expenseCost,maintenanceCost,driverPayout:expenses.filter(item=>item.type===ExpenseType.DRIVER_PAYMENT).reduce((sum,item)=>sum+item.amount,0),tollCost:expenses.filter(item=>item.type===ExpenseType.TOLL).reduce((sum,item)=>sum+item.amount,0),actualCost,profit,marginPercent:trip.revenue?profit/trip.revenue*100:null,costPerKm:trip.plannedDistanceKm?actualCost/trip.plannedDistanceKm:null,unallocatedCandidateCount:unallocatedExpenses._count+unallocatedFuel._count,unallocatedCandidateCost:(unallocatedExpenses._sum.amount||0)+(unallocatedFuel._sum.cost||0)}});
}));

const placeSchema=z.object({id:z.string().min(1),name:z.string().min(1),label:z.string().min(1),city:z.string().optional(),state:z.string(),latitude:z.number().finite().min(-90).max(90),longitude:z.number().finite().min(-180).max(180),provider:z.enum(['GOOGLE','PHOTON','BUILT_IN'])});
app.get('/api/places/search',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>res.json(await searchPlaces(String(req.query.q||'')))));
app.post('/api/routes/estimate',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{
  const {source,destination,vehicleId}=parse(z.object({source:placeSchema,destination:placeSchema,vehicleId:z.string().min(1)}),req.body);
  const organizationId=req.user!.organizationId;
  const vehicle=await db.vehicle.findFirst({where:{id:vehicleId,organizationId},select:{id:true,type:true,capacityKg:true}});
  if(!vehicle)throw Object.assign(new Error('Vehicle not found'),{status:404});
  const routes=await estimateRoutes(source as Place,destination as Place);
  if(routes.options.some(option=>option.estimatedToll===null)){
    const [historyTrips,tollExpenses]=await Promise.all([
      db.trip.findMany({where:{organizationId,status:{in:[TripStatus.COMPLETED,TripStatus.DISPATCHED]}},select:{id:true,vehicleId:true,source:true,destination:true,plannedDistanceKm:true,createdAt:true,dispatchedAt:true,completedAt:true,estimatedTollsInr:true,vehicle:{select:{type:true,capacityKg:true}}},orderBy:{createdAt:'desc'},take:100}),
      db.expense.findMany({where:{organizationId,type:'TOLL'},select:{vehicleId:true,amount:true,date:true},orderBy:{date:'desc'},take:250})
    ]);
    const observations=buildHistoricalTollObservations(historyTrips.map(trip=>({id:trip.id,vehicleId:trip.vehicleId,vehicleType:trip.vehicle.type,vehicleCapacityKg:trip.vehicle.capacityKg,source:trip.source,destination:trip.destination,distanceKm:trip.plannedDistanceKm,createdAt:trip.createdAt,dispatchedAt:trip.dispatchedAt,completedAt:trip.completedAt,providerEstimatedTollInr:trip.estimatedTollsInr})),tollExpenses.map(expense=>({vehicleId:expense.vehicleId,amountInr:expense.amount,date:expense.date})));
    const vehicleClass=resolveTollVehicleClass(vehicle.type,vehicle.capacityKg);
    routes.options=routes.options.map(option=>{
      if(option.estimatedToll!==null)return option;
      const estimate=estimateHistoricalToll({source:source as Place,destination:destination as Place,distanceKm:option.distanceKm,vehicleClass,observations});
      return estimate?{...option,estimatedToll:estimate.estimatedTollInr,tollEstimateStatus:'HISTORICAL_ESTIMATE' as const,tollEstimateSource:estimate.source,tollConfidence:estimate.confidence,tollSampleSize:estimate.sampleSize,tollEstimatedAt:estimate.asOf}:option;
    });
  }
  res.json(routes);
}));

const profitabilityPreviewSchema=z.object({vehicleId:z.string().min(1),plannedDistanceKm:z.coerce.number().positive(),revenue:z.coerce.number().nonnegative(),estimatedTollsInr:z.union([z.null(),z.coerce.number().nonnegative()]).default(null)});
async function estimateTripProfitability(organizationId:string,data:z.infer<typeof profitabilityPreviewSchema>){
  const vehicle=await db.vehicle.findFirst({where:{id:data.vehicleId,organizationId},select:{id:true,type:true,acquisitionCost:true}});
  if(!vehicle)throw Object.assign(new Error('Vehicle not found'),{status:404});
  const [maintenance,distance,recentFuelLogs,completedFuelTrips]=await Promise.all([
    db.maintenance.aggregate({where:{organizationId,vehicleId:vehicle.id,status:MaintenanceStatus.CLOSED},_sum:{cost:true}}),
    db.trip.aggregate({where:{organizationId,vehicleId:vehicle.id,status:TripStatus.COMPLETED},_sum:{plannedDistanceKm:true}}),
    db.fuelLog.findMany({where:{organizationId,vehicleId:vehicle.id,liters:{gt:0},cost:{gt:0}},select:{liters:true,cost:true,date:true},orderBy:{date:'desc'},take:5}),
    db.trip.findMany({where:{organizationId,vehicleId:vehicle.id,status:TripStatus.COMPLETED,fuelConsumedL:{gt:0}},select:{plannedDistanceKm:true,fuelConsumedL:true},orderBy:{completedAt:'desc'},take:10})
  ]);
  const fuelPrediction=buildFuelPrediction(recentFuelLogs,completedFuelTrips.map(trip=>({distanceKm:trip.plannedDistanceKm,fuelConsumedL:trip.fuelConsumedL!})));
  return calculateTripProfitability({
    revenueInr:data.revenue,
    plannedDistanceKm:data.plannedDistanceKm,
    estimatedTollsInr:data.estimatedTollsInr,
    vehicleType:vehicle.type,
    vehicleAcquisitionCostInr:vehicle.acquisitionCost,
    historicalMaintenanceCostInr:maintenance._sum.cost||0,
    historicalCompletedDistanceKm:distance._sum.plannedDistanceKm||0,
    fuelPrediction,
    config:tripProfitabilityConfig
  });
}
const estimatedProfitabilityData=(estimate:TripProfitabilityEstimate)=>({estimatedFuelCostInr:estimate.estimatedFuelCostInr,estimatedMaintenanceCostInr:estimate.estimatedMaintenanceCostInr,estimatedTripCostInr:estimate.estimatedTotalCostInr,estimatedProfitInr:estimate.estimatedProfitInr,estimatedProfitMarginPercent:estimate.profitMarginPercent,profitabilityEstimatedAt:new Date()});
type TripProfitabilityDb=Pick<Prisma.TransactionClient,'trip'>;
async function syncRealizedTripProfitability(client:TripProfitabilityDb,organizationId:string,tripId:string){
  const trip=await client.trip.findFirst({where:{id:tripId,organizationId,status:TripStatus.COMPLETED},include:{fuelLogs:{select:{cost:true}},maintenance:{select:{cost:true}},expenses:{select:{type:true,amount:true}}}});
  if(!trip)return null;
  const fuelCostInr=trip.fuelLogs.reduce((sum,row)=>sum+row.cost,0),maintenanceCostInr=trip.maintenance.reduce((sum,row)=>sum+row.cost,0);
  const driverPayoutInr=trip.expenses.filter(row=>row.type===ExpenseType.DRIVER_PAYMENT).reduce((sum,row)=>sum+row.amount,0);
  const tollCostInr=trip.expenses.filter(row=>row.type===ExpenseType.TOLL).reduce((sum,row)=>sum+row.amount,0);
  const otherExpenseCostInr=trip.expenses.filter(row=>row.type!==ExpenseType.DRIVER_PAYMENT&&row.type!==ExpenseType.TOLL).reduce((sum,row)=>sum+row.amount,0);
  const actual=calculateRealizedTripProfitability({revenueInr:trip.revenue,fuelCostInr,maintenanceCostInr,otherExpenseCostInr,driverPayoutInr,tollCostInr});
  return client.trip.update({where:{id:trip.id},data:{actualFuelCostInr:actual.fuelCostInr,actualMaintenanceCostInr:actual.maintenanceCostInr,actualExpenseCostInr:actual.otherExpenseCostInr,actualDriverPayoutInr:actual.driverPayoutInr,actualTollCostInr:actual.tollCostInr,actualTripCostInr:actual.actualTotalCostInr,actualProfitInr:actual.actualProfitInr,actualProfitMarginPercent:actual.actualProfitMarginPercent,profitabilityFinalizedAt:new Date()}});
}
app.post('/api/trips/profitability-estimate',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{
  const data=parse(profitabilityPreviewSchema,req.body);
  res.json(await estimateTripProfitability(req.user!.organizationId,data));
}));
app.get('/api/trips/:id/profitability-estimate',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{
  const trip=await db.trip.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId}});
  if(!trip)throw Object.assign(new Error('Trip not found'),{status:404});
  if(trip.status!==TripStatus.DRAFT)throw Object.assign(new Error('Profitability is reviewed before a draft is dispatched'),{status:409});
  res.json(await estimateTripProfitability(req.user!.organizationId,{vehicleId:trip.vehicleId,plannedDistanceKm:trip.plannedDistanceKm,revenue:trip.revenue,estimatedTollsInr:trip.estimatedTollsInr}));
}));

async function getAssignmentContext(organizationId:string,vehicleId:string,driverId:string){
  const [vehicle,driver,vehicleTrip,driverTrip,maintenance]=await Promise.all([
    db.vehicle.findFirst({where:{id:vehicleId,organizationId}}),
    db.driver.findFirst({where:{id:driverId,organizationId}}),
    db.trip.findFirst({where:{organizationId,vehicleId,status:TripStatus.DISPATCHED},select:{tripNo:true}}),
    db.trip.findFirst({where:{organizationId,driverId,status:TripStatus.DISPATCHED},select:{tripNo:true}}),
    db.maintenance.findFirst({where:{organizationId,vehicleId,status:MaintenanceStatus.ACTIVE},select:{serviceType:true}})
  ]);
  return {vehicle,driver,vehicleTripNo:vehicleTrip?.tripNo,driverTripNo:driverTrip?.tripNo,maintenanceService:maintenance?.serviceType};
}

app.post('/api/trips/validate-assignment',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{
  const data=parse(tripSchema.pick({vehicleId:true,driverId:true,cargoWeightKg:true}),req.body);
  const context=await getAssignmentContext(req.user!.organizationId,data.vehicleId,data.driverId);
  try { assertAssignmentEligible({...context,cargoWeightKg:data.cargoWeightKg}); res.json({eligible:true,reasons:[]}); }
  catch(error) { if(error instanceof AssignmentEligibilityError)return res.json({eligible:false,reasons:error.reasons}); throw error; }
}));

app.post('/api/trips',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{
  const data=parse(tripSchema,req.body);
  const context=await getAssignmentContext(req.user!.organizationId,data.vehicleId,data.driverId);
  assertAssignmentEligible({...context,cargoWeightKg:data.cargoWeightKg});
  const tripNo=`TRP${String((await db.trip.count({where:{organizationId:req.user!.organizationId}}))+1).padStart(4,'0')}`;
  const estimate=await estimateTripProfitability(req.user!.organizationId,{vehicleId:data.vehicleId,plannedDistanceKm:data.plannedDistanceKm,revenue:data.revenue,estimatedTollsInr:data.estimatedTollsInr});
  res.status(201).json(await db.trip.create({data:{...data,...estimatedProfitabilityData(estimate),tripNo,organizationId:req.user!.organizationId},include:{vehicle:true,driver:true}}));
}));
app.post('/api/trips/:id/dispatch',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{
  const trip=await db.trip.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId}}); if(!trip) throw Object.assign(new Error('Trip not found'),{status:404});
  const context=await getAssignmentContext(req.user!.organizationId,trip.vehicleId,trip.driverId);
  assertAssignmentEligible({...context,cargoWeightKg:trip.cargoWeightKg,tripStatus:trip.status});
  const estimate=await estimateTripProfitability(req.user!.organizationId,{vehicleId:trip.vehicleId,plannedDistanceKm:trip.plannedDistanceKm,revenue:trip.revenue,estimatedTollsInr:trip.estimatedTollsInr});
  const result=await db.$transaction(async tx=>{
    const vehicle=await tx.vehicle.updateMany({where:{id:trip.vehicleId,organizationId:req.user!.organizationId,status:VehicleStatus.AVAILABLE},data:{status:VehicleStatus.ON_TRIP}});
    const driver=await tx.driver.updateMany({where:{id:trip.driverId,organizationId:req.user!.organizationId,status:DriverStatus.AVAILABLE,licenseExpiry:{gt:new Date()}},data:{status:DriverStatus.ON_TRIP}});
    if(vehicle.count!==1||driver.count!==1)throw new AssignmentEligibilityError([{code:vehicle.count!==1?'VEHICLE_ON_TRIP':'DRIVER_ON_TRIP',field:vehicle.count!==1?'vehicleId':'driverId',message:'Assignment availability changed while dispatching. Review the latest vehicle and driver status, then try again.'}]);
    return tx.trip.update({where:{id:trip.id},data:{status:TripStatus.DISPATCHED,dispatchedAt:new Date(),...estimatedProfitabilityData(estimate)},include:{vehicle:true,driver:true}})
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}); res.json(result);
}));
app.post('/api/trips/:id/complete',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{
  const {finalOdometerKm,fuelConsumedL,driverHours}=parse(z.object({finalOdometerKm:z.coerce.number().positive(),fuelConsumedL:z.coerce.number().positive(),driverHours:z.coerce.number().positive().optional()}),req.body); const trip=await db.trip.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId},include:{driver:true}}); if(!trip||trip.status!==TripStatus.DISPATCHED) throw Object.assign(new Error('Only dispatched trips can be completed'),{status:409});
  if(trip.driver.payType===DriverPayType.HOURLY&&trip.driver.payRate>0&&!driverHours)return res.status(400).json({message:'Driver hours are required for hourly payout'});
  const payout=trip.driver.payRate>0?(trip.driver.payType===DriverPayType.HOURLY?trip.driver.payRate*(driverHours||0):trip.driver.payRate):0;
  const result=await db.$transaction(async tx=>{await tx.vehicle.update({where:{id:trip.vehicleId},data:{status:VehicleStatus.AVAILABLE,odometerKm:finalOdometerKm}});await tx.driver.update({where:{id:trip.driverId},data:{status:DriverStatus.AVAILABLE}});const completed=await tx.trip.update({where:{id:trip.id},data:{status:TripStatus.COMPLETED,completedAt:new Date(),finalOdometerKm,fuelConsumedL},include:{vehicle:true,driver:true}});if(payout>0)await tx.expense.create({data:{organizationId:req.user!.organizationId,tripId:trip.id,vehicleId:trip.vehicleId,driverId:trip.driverId,type:ExpenseType.DRIVER_PAYMENT,description:`Driver payout for ${trip.tripNo} · ${trip.driver.payType===DriverPayType.HOURLY?`${driverHours} hours @ ${moneyForLog(trip.driver.payRate)}/hr`:`per trip @ ${moneyForLog(trip.driver.payRate)}`}`,amount:payout,date:new Date()}});await syncRealizedTripProfitability(tx,req.user!.organizationId,trip.id);return completed});res.json(result);
}));
app.post('/api/trips/:id/cancel',allow(Role.DISPATCHER,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const trip=await db.trip.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId}});if(!trip||(trip.status!==TripStatus.DRAFT&&trip.status!==TripStatus.DISPATCHED))throw Object.assign(new Error('Trip cannot be cancelled'),{status:409});const wasLive=trip.status===TripStatus.DISPATCHED;const result=await db.$transaction(async tx=>{if(wasLive){await tx.vehicle.update({where:{id:trip.vehicleId},data:{status:VehicleStatus.AVAILABLE}});await tx.driver.update({where:{id:trip.driverId},data:{status:DriverStatus.AVAILABLE}})}return tx.trip.update({where:{id:trip.id},data:{status:TripStatus.CANCELLED},include:{vehicle:true,driver:true}})});res.json(result);}));

app.get('/api/profitability',allow(Role.DISPATCHER,Role.FLEET_MANAGER,Role.FINANCIAL_ANALYST),asyncRoute(async(req,res)=>{
  const organizationId=req.user!.organizationId;
  const current=await db.trip.findMany({where:{organizationId,status:{not:TripStatus.CANCELLED}},select:{id:true,vehicleId:true,plannedDistanceKm:true,revenue:true,estimatedTollsInr:true,profitabilityEstimatedAt:true,status:true}});
  for(const trip of current){
    if(trip.profitabilityEstimatedAt===null){const estimate=await estimateTripProfitability(organizationId,{vehicleId:trip.vehicleId,plannedDistanceKm:trip.plannedDistanceKm,revenue:trip.revenue,estimatedTollsInr:trip.estimatedTollsInr});await db.trip.update({where:{id:trip.id},data:estimatedProfitabilityData(estimate)});}
    if(trip.status===TripStatus.COMPLETED)await syncRealizedTripProfitability(db,organizationId,trip.id);
  }
  const trips=await db.trip.findMany({where:{organizationId,status:{not:TripStatus.CANCELLED}},select:{id:true,tripNo:true,source:true,destination:true,status:true,revenue:true,plannedDistanceKm:true,estimatedTollsInr:true,estimatedFuelCostInr:true,estimatedMaintenanceCostInr:true,estimatedTripCostInr:true,estimatedProfitInr:true,estimatedProfitMarginPercent:true,profitabilityEstimatedAt:true,actualFuelCostInr:true,actualMaintenanceCostInr:true,actualExpenseCostInr:true,actualDriverPayoutInr:true,actualTollCostInr:true,actualTripCostInr:true,actualProfitInr:true,actualProfitMarginPercent:true,profitabilityFinalizedAt:true,createdAt:true,completedAt:true,vehicle:{select:{name:true,registrationNo:true}},driver:{select:{name:true}}},orderBy:{createdAt:'desc'}});
  const realized=trips.filter(trip=>trip.status===TripStatus.COMPLETED&&trip.actualProfitInr!==null),planned=trips.filter(trip=>trip.estimatedProfitInr!==null);
  const estimatedProfit=planned.reduce((sum,trip)=>sum+(trip.estimatedProfitInr||0),0),actualProfit=realized.reduce((sum,trip)=>sum+(trip.actualProfitInr||0),0);
  res.json({summary:{trackedTrips:trips.length,completedTrips:realized.length,estimatedProfit,actualProfit,profitVariance:realized.reduce((sum,trip)=>sum+((trip.actualProfitInr||0)-(trip.estimatedProfitInr||0)),0),actualRevenue:realized.reduce((sum,trip)=>sum+trip.revenue,0),actualCost:realized.reduce((sum,trip)=>sum+(trip.actualTripCostInr||0),0)},trips,syncedAt:new Date()});
}));

const maintenanceSchema=z.object({vehicleId:z.string(),serviceType:z.string().min(2),description:z.string().optional(),cost:z.coerce.number().nonnegative()});
app.get('/api/maintenance',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>res.json(await db.maintenance.findMany({where:{organizationId:req.user!.organizationId},include:{vehicle:true},orderBy:{startDate:'desc'}}))));
app.post('/api/maintenance',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const data=parse(maintenanceSchema,req.body);const v=await db.vehicle.findFirst({where:{id:data.vehicleId,organizationId:req.user!.organizationId}});if(!v||v.status!==VehicleStatus.AVAILABLE)throw Object.assign(new Error('Only available vehicles can enter maintenance'),{status:409});const result=await db.$transaction(async tx=>{await tx.vehicle.update({where:{id:v.id},data:{status:VehicleStatus.IN_SHOP}});return tx.maintenance.create({data:{...data,organizationId:req.user!.organizationId},include:{vehicle:true}})});res.status(201).json(result);}));
app.post('/api/maintenance/:id/close',allow(Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const m=await db.maintenance.findFirst({where:{id:idParam(req),organizationId:req.user!.organizationId},include:{vehicle:true}});if(!m||m.status!==MaintenanceStatus.ACTIVE)throw Object.assign(new Error('Active maintenance record not found'),{status:404});const result=await db.$transaction(async tx=>{if(m.vehicle.status!==VehicleStatus.RETIRED)await tx.vehicle.update({where:{id:m.vehicleId},data:{status:VehicleStatus.AVAILABLE}});return tx.maintenance.update({where:{id:m.id},data:{status:MaintenanceStatus.CLOSED,endDate:new Date()},include:{vehicle:true}})});res.json(result);}));

app.get('/api/finance',allow(Role.FINANCIAL_ANALYST,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const where={organizationId:req.user!.organizationId};const [fuelLogs,expenses]=await Promise.all([db.fuelLog.findMany({where,include:{vehicle:true},orderBy:{date:'desc'}}),db.expense.findMany({where,include:{vehicle:true,submittedByDriver:{select:{id:true,name:true}}},orderBy:{date:'desc'}})]);res.json({fuelLogs,expenses:await Promise.all(expenses.map(expenseResponse))});}));
app.post('/api/fuel',allow(Role.FINANCIAL_ANALYST,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const data=parse(z.object({vehicleId:z.string(),liters:z.coerce.number().positive(),cost:z.coerce.number().positive(),date:z.coerce.date().optional(),odometerKm:z.coerce.number().positive().optional()}),req.body);const vehicle=await db.vehicle.findFirst({where:{id:data.vehicleId,organizationId:req.user!.organizationId}});if(!vehicle)throw Object.assign(new Error('Vehicle not found'),{status:404});res.status(201).json(await db.fuelLog.create({data:{...data,organizationId:req.user!.organizationId},include:{vehicle:true}}));}));
app.post('/api/expenses',allow(Role.FINANCIAL_ANALYST,Role.FLEET_MANAGER),asyncRoute(async(req,res)=>{const data=parse(z.object({vehicleId:z.string(),type:z.enum(ExpenseType),description:z.string().optional(),amount:z.coerce.number().positive(),date:z.coerce.date().optional()}),req.body);const vehicle=await db.vehicle.findFirst({where:{id:data.vehicleId,organizationId:req.user!.organizationId}});if(!vehicle)throw Object.assign(new Error('Vehicle not found'),{status:404});res.status(201).json(await db.expense.create({data:{...data,organizationId:req.user!.organizationId},include:{vehicle:true}}));}));

async function analytics(organizationId:string){
  const where={organizationId};const [vehicles,fuel,maintenance,expenses,trips]=await Promise.all([db.vehicle.findMany({where}),db.fuelLog.findMany({where}),db.maintenance.findMany({where}),db.expense.findMany({where}),db.trip.findMany({where})]);
  return calculateFleetAnalytics({vehicles,fuel,maintenance,expenses,trips});
}
const allowFinancialAnalytics=(req:Request,res:Response,next:NextFunction)=>disclosurePolicyForRole(req.user!.role).financialAnalytics?next():res.status(403).json({message:'You do not have permission to view financial analytics'});
app.get('/api/analytics',allowFinancialAnalytics,asyncRoute(async(req,res)=>res.json(await analytics(req.user!.organizationId))));
app.get('/api/analytics/export.csv',allowFinancialAnalytics,asyncRoute(async(req,res)=>{const a=await analytics(req.user!.organizationId);const csv=['Vehicle,Registration,Status,Completed Trips,Distance Km,Revenue,Fuel Cost,Maintenance Cost,Other Expenses,Operational Cost,Profit,Margin %,Cost Per Km,ROI %',...a.byVehicle.map(x=>`"${x.name}","${x.registrationNo}",${x.status},${x.completedTrips},${x.distanceKm.toFixed(2)},${x.revenue.toFixed(2)},${x.fuelCost.toFixed(2)},${x.maintenanceCost.toFixed(2)},${x.expenseCost.toFixed(2)},${x.operationalCost.toFixed(2)},${x.profit.toFixed(2)},${x.marginPercent?.toFixed(2)??''},${x.costPerKm?.toFixed(2)??''},${x.roi?.toFixed(2)??''}`)].join('\n');res.type('text/csv').attachment('fleetpilot-analytics.csv').send(csv);}));

app.use((err:any,req:Request,res:Response,_next:NextFunction)=>{console.error(err);if(err instanceof InvalidResetTokenError)return res.status(err.status).json({code:err.code,message:err.message});if(err instanceof multer.MulterError){const isDriverOnboarding=req.path.includes('/onboarding');return res.status(400).json({message:err.code==='LIMIT_FILE_SIZE'?`Image must be ${isDriverOnboarding?'8':'20'} MB or smaller`:'The image could not be uploaded'});}if(err instanceof AssignmentEligibilityError)return res.status(err.status).json({code:err.code,message:err.message,reasons:err.reasons});if(err instanceof Prisma.PrismaClientKnownRequestError){if(err.code==='P2002')return res.status(409).json({message:'A record with this unique value already exists'});if(err.code==='P2022')return res.status(503).json({message:'Database setup is incomplete. Please run the latest FleetPilot migration.'});return res.status(500).json({message:'The database could not complete this request'});}if(err instanceof Prisma.PrismaClientValidationError)return res.status(400).json({message:'The request contains invalid data'});res.status(err.status||500).json({message:err.status?err.message:'Something went wrong. Please try again.'});});
app.listen(PORT,()=>console.log(`TransitOps API running at http://localhost:${PORT}`));
process.on('SIGTERM',async()=>{await db.$disconnect();process.exit(0)});
