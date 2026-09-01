"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const multer_1 = __importDefault(require("multer"));
const node_crypto_1 = require("node:crypto");
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const google_auth_library_1 = require("google-auth-library");
const routePlanning_1 = require("./constants/routePlanning");
const objectStorage_1 = require("./services/objectStorage");
const ocr_1 = require("./services/ocr");
const chat_1 = require("./chat/chat");
const fastagMatching_1 = require("./services/fastagMatching");
const assignmentEligibility_1 = require("./services/assignmentEligibility");
const db = new client_1.PrismaClient();
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT || 4000);
const SECRET = process.env.JWT_SECRET || 'development-only-change-me';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = new google_auth_library_1.OAuth2Client(GOOGLE_CLIENT_ID);
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map(origin => origin.trim());
app.use((0, cors_1.default)({ origin: (origin, callback) => !origin || allowedOrigins.includes(origin) ? callback(null, true) : callback(new Error('Origin is not allowed by CORS')), credentials: true }));
app.use(express_1.default.json());
const asyncRoute = (fn) => (req, res, next) => { Promise.resolve(fn(req, res, next)).catch(next); };
const authenticate = asyncRoute(async (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/, '');
    if (!token)
        return res.status(401).json({ message: 'Authentication required' });
    try {
        const claims = jsonwebtoken_1.default.verify(token, SECRET);
        const account = await db.user.findUnique({ where: { id: claims.id }, include: { organization: true, driverProfile: true } });
        if (!account || !account.isActive)
            return res.status(401).json({ message: 'This session no longer has access' });
        await db.user.update({ where: { id: account.id }, data: { lastActiveAt: new Date() } });
        req.user = publicUser(account);
        next();
    }
    catch {
        res.status(401).json({ message: 'Session expired. Please sign in again.' });
    }
});
const elevated = [client_1.Role.OWNER, client_1.Role.ADMIN];
const allow = (...roles) => (req, res, next) => [...elevated, ...roles].includes(req.user.role) ? next() : res.status(403).json({ message: 'You do not have permission for this action' });
const parse = (schema, data) => { const out = schema.safeParse(data); if (!out.success)
    throw Object.assign(new Error(out.error.issues[0]?.message || 'Invalid request'), { status: 400 }); return out.data; };
const idParam = (req) => String(req.params.id);
const slugify = (name) => name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 45);
const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role, organizationId: user.organizationId, organizationName: user.organization.name, mustChangePassword: user.mustChangePassword, ...(user.driverProfile ? { driverId: user.driverProfile.id, onboardingStatus: user.driverProfile.onboardingStatus } : {}) });
const issueSession = (user) => ({ token: jsonwebtoken_1.default.sign(user, SECRET, { expiresIn: '8h' }), user });
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 3 }, fileFilter: (_req, file, callback) => /^image\/(jpeg|png|webp|heic|heif)$/.test(file.mimetype) ? callback(null, true) : callback(Object.assign(new Error('Only JPEG, PNG, WebP, or HEIC images are allowed'), { status: 400 })) });
const normalizeRegistration = (value) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
const signedPrivateUrl = (objectKey) => objectKey && (0, objectStorage_1.objectStorageConfigured)() ? (0, objectStorage_1.signedObjectUrl)(objectKey) : Promise.resolve(null);
const optionalPositiveNumber = zod_1.z.preprocess(value => value === '' || value === null || value === undefined ? undefined : value, zod_1.z.coerce.number().positive().optional());
const optionalNonnegativeNumber = zod_1.z.preprocess(value => value === '' || value === null || value === undefined ? undefined : value, zod_1.z.coerce.number().nonnegative().optional());
const fastagTransactionSchema = zod_1.z.object({ providerTxnId: zod_1.z.string().trim().min(3).max(160), plazaName: zod_1.z.string().trim().min(2).max(180), lane: zod_1.z.string().trim().max(80).optional(), occurredAt: zod_1.z.coerce.date(), amount: zod_1.z.coerce.number().nonnegative(), currency: zod_1.z.string().trim().length(3).default('INR'), status: zod_1.z.enum(client_1.FastagTransactionStatus).default(client_1.FastagTransactionStatus.SETTLED), maskedTagId: zod_1.z.string().trim().max(80).optional() });
async function reconcileFastagTransaction(transactionId, forcedTripId) {
    const transaction = await db.fastagTransaction.findUnique({ where: { id: transactionId }, include: { connection: true } });
    if (!transaction)
        return null;
    let automaticConfidence = 0;
    let trip = forcedTripId === null ? null : forcedTripId ? await db.trip.findFirst({ where: { id: forcedTripId, organizationId: transaction.organizationId, vehicleId: transaction.vehicleId } }) : null;
    if (forcedTripId && !trip)
        throw Object.assign(new Error('The selected trip does not belong to this vehicle'), { status: 409 });
    if (forcedTripId === undefined) {
        const candidates = await db.trip.findMany({ where: { organizationId: transaction.organizationId, vehicleId: transaction.vehicleId, dispatchedAt: { not: null }, status: { in: [client_1.TripStatus.DISPATCHED, client_1.TripStatus.IN_PROGRESS, client_1.TripStatus.COMPLETED] } }, orderBy: { dispatchedAt: 'desc' }, take: 20 });
        const selected = (0, fastagMatching_1.selectFastagTrip)(candidates, transaction.occurredAt);
        if (selected) {
            trip = candidates.find(candidate => candidate.id === selected.tripId) || null;
            automaticConfidence = selected.confidence;
        }
    }
    const matchStatus = trip ? client_1.TollMatchStatus.MATCHED : forcedTripId === null ? client_1.TollMatchStatus.UNMATCHED : client_1.TollMatchStatus.REVIEW_REQUIRED;
    const matchConfidence = trip ? (forcedTripId ? 1 : automaticConfidence) : 0;
    return db.$transaction(async (tx) => {
        let expenseId = transaction.expenseId;
        if (transaction.status === client_1.FastagTransactionStatus.REVERSED && expenseId) {
            await tx.expense.update({ where: { id: expenseId }, data: { amount: 0, description: `Reversed FASTag toll · ${transaction.plazaName}` } });
        }
        else if (transaction.status === client_1.FastagTransactionStatus.SETTLED && trip) {
            if (expenseId)
                await tx.expense.update({ where: { id: expenseId }, data: { tripId: trip.id, driverId: trip.driverId, amount: transaction.amount, date: transaction.occurredAt, vendor: transaction.plazaName, description: `FASTag toll · ${transaction.plazaName}${transaction.lane ? ` · ${transaction.lane}` : ''}` } });
            else {
                const expense = await tx.expense.create({ data: { organizationId: transaction.organizationId, vehicleId: transaction.vehicleId, tripId: trip.id, driverId: trip.driverId, type: client_1.ExpenseType.TOLL, amount: transaction.amount, date: transaction.occurredAt, vendor: transaction.plazaName, description: `FASTag toll · ${transaction.plazaName}${transaction.lane ? ` · ${transaction.lane}` : ''}`, source: client_1.RecordSource.FASTAG } });
                expenseId = expense.id;
            }
        }
        return tx.fastagTransaction.update({ where: { id: transaction.id }, data: { tripId: trip?.id ?? null, expenseId, matchStatus, matchConfidence }, include: { vehicle: true, trip: true, expense: true, connection: true } });
    });
}
async function ingestFastagTransaction(connectionId, input, rawPayload) {
    const connection = await db.fastagConnection.findUnique({ where: { id: connectionId }, include: { vehicle: true } });
    if (!connection || connection.status === client_1.FastagConnectionStatus.DISCONNECTED)
        throw Object.assign(new Error('Active FASTag connection not found'), { status: 404 });
    const row = await db.fastagTransaction.upsert({ where: { connectionId_providerTxnId: { connectionId, providerTxnId: input.providerTxnId } }, create: { organizationId: connection.organizationId, connectionId, vehicleId: connection.vehicleId, ...input, rawPayload: rawPayload === undefined ? undefined : JSON.parse(JSON.stringify(rawPayload)) }, update: { plazaName: input.plazaName, lane: input.lane, occurredAt: input.occurredAt, amount: input.amount, currency: input.currency, status: input.status, maskedTagId: input.maskedTagId, rawPayload: rawPayload === undefined ? undefined : JSON.parse(JSON.stringify(rawPayload)) } });
    await db.fastagConnection.update({ where: { id: connection.id }, data: { status: client_1.FastagConnectionStatus.ACTIVE, lastSyncedAt: new Date(), lastError: null } });
    return reconcileFastagTransaction(row.id);
}
function validFastagSignature(connectionId, body, signature) { const secret = process.env.FASTAG_WEBHOOK_SECRET; if (!secret || !signature)
    return false; const expected = (0, node_crypto_1.createHmac)('sha256', secret).update(`${connectionId}.${JSON.stringify(body)}`).digest('hex'); const supplied = signature.replace(/^sha256=/, ''); return expected.length === supplied.length && (0, node_crypto_1.timingSafeEqual)(Buffer.from(expected), Buffer.from(supplied)); }
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'TransitOps API' }));
app.post('/api/auth/login', asyncRoute(async (req, res) => {
    const { email, password } = parse(zod_1.z.object({ email: zod_1.z.email(), password: zod_1.z.string().min(8) }), req.body);
    const user = await db.user.findUnique({ where: { email: email.toLowerCase() }, include: { organization: true, driverProfile: true } });
    if (!user || !user.passwordHash || !(await bcryptjs_1.default.compare(password, user.passwordHash)))
        return res.status(401).json({ message: 'Email or password is incorrect' });
    if (!user.isActive)
        return res.status(403).json({ message: 'Your account has been suspended. Contact your company administrator.' });
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lastActiveAt: new Date() } });
    res.json(issueSession(publicUser(user)));
}));
app.post('/api/auth/register', asyncRoute(async (req, res) => {
    const { name, email, password, companyName } = parse(zod_1.z.object({ name: zod_1.z.string().trim().min(2).max(80), email: zod_1.z.email(), password: zod_1.z.string().min(10).regex(/[A-Z]/, 'Password needs an uppercase letter').regex(/[0-9]/, 'Password needs a number'), companyName: zod_1.z.string().trim().min(2).max(100) }), req.body);
    const normalizedEmail = email.toLowerCase();
    if (await db.user.findUnique({ where: { email: normalizedEmail } }))
        return res.status(409).json({ message: 'An account already exists for this email' });
    const base = slugify(companyName) || 'company';
    let slug = base;
    let suffix = 1;
    while (await db.organization.findUnique({ where: { slug } }))
        slug = `${base}-${++suffix}`;
    const user = await db.$transaction(async (tx) => {
        const organization = await tx.organization.create({ data: { name: companyName, slug, operationsEmail: normalizedEmail } });
        return tx.user.create({ data: { name, email: normalizedEmail, passwordHash: await bcryptjs_1.default.hash(password, 12), role: client_1.Role.OWNER, organizationId: organization.id, lastLoginAt: new Date(), lastActiveAt: new Date() }, include: { organization: true } });
    });
    res.status(201).json(issueSession(publicUser(user)));
}));
app.post('/api/auth/google', asyncRoute(async (req, res) => {
    if (!GOOGLE_CLIENT_ID)
        return res.status(503).json({ message: 'Google sign-in is not configured yet' });
    const { credential, intent, companyName } = parse(zod_1.z.object({ credential: zod_1.z.string().min(20), intent: zod_1.z.enum(['login', 'register']), companyName: zod_1.z.string().trim().min(2).max(100).optional() }), req.body);
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || !payload.email_verified)
        return res.status(401).json({ message: 'Google could not verify this email' });
    const email = payload.email.toLowerCase();
    let user = await db.user.findUnique({ where: { email }, include: { organization: true, driverProfile: true } });
    if (!user) {
        if (intent !== 'register' || !companyName)
            return res.status(404).json({ message: 'No FleetPilot account found. Create your company workspace first.' });
        const base = slugify(companyName) || 'company';
        let slug = base;
        let suffix = 1;
        while (await db.organization.findUnique({ where: { slug } }))
            slug = `${base}-${++suffix}`;
        user = await db.$transaction(async (tx) => { const organization = await tx.organization.create({ data: { name: companyName, slug, operationsEmail: email } }); return tx.user.create({ data: { name: payload.name || email.split('@')[0], email, googleSub: payload.sub, role: client_1.Role.OWNER, organizationId: organization.id, lastLoginAt: new Date(), lastActiveAt: new Date() }, include: { organization: true, driverProfile: true } }); });
    }
    else {
        if (!user.isActive)
            return res.status(403).json({ message: 'Your account has been suspended. Contact your company administrator.' });
        if (user.googleSub && user.googleSub !== payload.sub)
            return res.status(409).json({ message: 'This email is linked to another Google identity' });
        user = await db.user.update({ where: { id: user.id }, data: { googleSub: payload.sub, lastLoginAt: new Date(), lastActiveAt: new Date() }, include: { organization: true, driverProfile: true } });
    }
    res.json(issueSession(publicUser(user)));
}));
app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: req.user }));
app.post('/api/fastag/webhook/:connectionId', asyncRoute(async (req, res) => { const connectionId = String(req.params.connectionId); if (!validFastagSignature(connectionId, req.body, String(req.headers['x-fastag-signature'] || '')))
    return res.status(401).json({ message: 'Invalid FASTag webhook signature' }); const data = parse(fastagTransactionSchema, req.body); res.status(202).json(await ingestFastagTransaction(connectionId, data, req.body)); }));
app.post('/api/driver/auth/register', asyncRoute(async (req, res) => {
    return res.status(410).json({ message: 'Driver self-registration is disabled. Ask your company Owner, Administrator, or Fleet Manager to create your access.' });
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
app.use('/api', authenticate);
app.use('/api/chat', (0, chat_1.createChatRouter)(db));
app.post('/api/auth/change-password', asyncRoute(async (req, res) => { const { currentPassword, newPassword } = parse(zod_1.z.object({ currentPassword: zod_1.z.string().min(8), newPassword: zod_1.z.string().min(10).regex(/[A-Z]/, 'Password needs an uppercase letter').regex(/[0-9]/, 'Password needs a number') }), req.body); const account = await db.user.findUnique({ where: { id: req.user.id } }); if (!account?.passwordHash || !(await bcryptjs_1.default.compare(currentPassword, account.passwordHash)))
    return res.status(401).json({ message: 'Current password is incorrect' }); await db.user.update({ where: { id: account.id }, data: { passwordHash: await bcryptjs_1.default.hash(newPassword, 12), mustChangePassword: false } }); res.json({ message: 'Password changed successfully' }); }));
app.get('/api/organization', allow(client_1.Role.FLEET_MANAGER, client_1.Role.DISPATCHER, client_1.Role.SAFETY_OFFICER, client_1.Role.FINANCIAL_ANALYST), asyncRoute(async (req, res) => res.json(await db.organization.findUnique({ where: { id: req.user.organizationId } }))));
app.put('/api/organization', allow(client_1.Role.OWNER, client_1.Role.ADMIN), asyncRoute(async (req, res) => { const data = parse(zod_1.z.object({ name: zod_1.z.string().trim().min(2).max(100), operationsEmail: zod_1.z.email().optional() }), req.body); res.json(await db.organization.update({ where: { id: req.user.organizationId }, data })); }));
app.get('/api/users', allow(client_1.Role.OWNER, client_1.Role.ADMIN, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => res.json(await db.user.findMany({ where: { organizationId: req.user.organizationId, ...(req.user.role === client_1.Role.FLEET_MANAGER ? { role: client_1.Role.DRIVER } : {}) }, select: { id: true, name: true, email: true, role: true, isActive: true, mustChangePassword: true, lastLoginAt: true, lastActiveAt: true, createdAt: true, googleSub: true, driverProfile: { select: { id: true, onboardingStatus: true, status: true } } }, orderBy: { createdAt: 'asc' } }))));
app.get('/api/driver-access', allow(client_1.Role.OWNER, client_1.Role.ADMIN, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => {
    const drivers = await db.driver.findMany({
        where: { organizationId: req.user.organizationId, userId: { not: null } },
        include: {
            user: { select: { id: true, email: true, isActive: true, mustChangePassword: true, lastLoginAt: true, lastActiveAt: true, createdAt: true } },
            documents: { select: { id: true, type: true, objectKey: true, ocrConfidence: true, createdAt: true } },
            trips: { where: { status: { in: [client_1.TripStatus.DISPATCHED, client_1.TripStatus.IN_PROGRESS] } }, select: { id: true, tripNo: true, source: true, destination: true, status: true, vehicle: { select: { id: true, name: true, registrationNo: true } } }, orderBy: { createdAt: 'desc' }, take: 1 },
            tripEvidence: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
            _count: { select: { documents: true, trips: true, tripEvidence: true, fuelLogs: true, expenses: true, maintenance: true } }
        },
        orderBy: { createdAt: 'desc' }
    });
    const now = Date.now();
    const roster = await Promise.all(drivers.map(async (driver) => {
        const documentTypes = new Set(driver.documents.map(document => document.type));
        const profilePhoto = driver.documents.find(document => document.type === client_1.DriverDocumentType.PROFILE_PHOTO);
        const lastActiveAt = driver.user?.lastActiveAt || null;
        const inactiveMinutes = lastActiveAt ? (now - lastActiveAt.getTime()) / 60_000 : null;
        const syncState = inactiveMinutes === null ? 'NEVER' : inactiveMinutes <= 5 ? 'ONLINE' : inactiveMinutes <= 1440 ? 'RECENT' : 'OFFLINE';
        const readinessIssues = [];
        if (!driver.user?.isActive)
            readinessIssues.push('Account suspended');
        if (driver.user?.mustChangePassword)
            readinessIssues.push('Temporary password not changed');
        if (!documentTypes.has(client_1.DriverDocumentType.PROFILE_PHOTO))
            readinessIssues.push('Live profile photo required');
        if (!documentTypes.has(client_1.DriverDocumentType.LICENSE_FRONT) || !documentTypes.has(client_1.DriverDocumentType.LICENSE_BACK))
            readinessIssues.push('Both licence images required');
        if (driver.onboardingStatus !== client_1.DriverOnboardingStatus.VERIFIED)
            readinessIssues.push('Company approval pending');
        if (driver.licenseCategory === 'PENDING')
            readinessIssues.push('Licence category pending');
        if (driver.licenseExpiry.getTime() <= now)
            readinessIssues.push('Licence expired');
        const { documents, tripEvidence, trips, ...safeDriver } = driver;
        return { ...safeDriver, documentTypes: [...documentTypes], profilePhotoUrl: profilePhoto ? await signedPrivateUrl(profilePhoto.objectKey) : null, currentTrip: trips[0] || null, lastEvidenceAt: tripEvidence[0]?.createdAt || null, syncState, readinessIssues, readyForDispatch: readinessIssues.length === 0 };
    }));
    res.json({
        summary: { total: roster.length, active: roster.filter(driver => driver.user?.isActive).length, verified: roster.filter(driver => driver.onboardingStatus === client_1.DriverOnboardingStatus.VERIFIED).length, online: roster.filter(driver => driver.syncState === 'ONLINE').length, needsAttention: roster.filter(driver => !driver.readyForDispatch).length },
        drivers: roster
    });
}));
app.post('/api/users', allow(client_1.Role.OWNER, client_1.Role.ADMIN, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => {
    const { name, email, password, role, contact } = parse(zod_1.z.object({ name: zod_1.z.string().trim().min(2).max(80), email: zod_1.z.email(), password: zod_1.z.string().min(10).regex(/[A-Z]/).regex(/[0-9]/), role: zod_1.z.enum(client_1.Role).refine(r => r !== client_1.Role.OWNER, 'Owner access cannot be assigned here'), contact: zod_1.z.string().trim().min(7).max(20).optional() }), req.body);
    if (req.user.role === client_1.Role.FLEET_MANAGER && role !== client_1.Role.DRIVER)
        return res.status(403).json({ message: 'Fleet Managers can create driver access only' });
    if (req.user.role === client_1.Role.ADMIN && role === client_1.Role.ADMIN)
        return res.status(403).json({ message: 'Only the Owner can add another Admin' });
    if (role === client_1.Role.DRIVER && !contact)
        return res.status(400).json({ message: 'A contact number is required for driver access' });
    const normalizedEmail = email.toLowerCase();
    if (await db.user.findUnique({ where: { email: normalizedEmail } }))
        return res.status(409).json({ message: 'An account already exists for this email' });
    const account = await db.$transaction(async (tx) => { const user = await tx.user.create({ data: { name, email: normalizedEmail, passwordHash: await bcryptjs_1.default.hash(password, 12), role, organizationId: req.user.organizationId, mustChangePassword: true } }); if (role === client_1.Role.DRIVER)
        await tx.driver.create({ data: { name, contact: contact, licenseNo: `PENDING-${user.id}`, licenseCategory: 'PENDING', licenseExpiry: new Date(), status: client_1.DriverStatus.OFF_DUTY, onboardingStatus: client_1.DriverOnboardingStatus.PENDING, userId: user.id, organizationId: req.user.organizationId } }); return tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, name: true, email: true, role: true, isActive: true, mustChangePassword: true, createdAt: true, driverProfile: { select: { id: true, onboardingStatus: true, status: true } } } }); });
    res.status(201).json(account);
}));
app.patch('/api/users/:id', allow(client_1.Role.OWNER, client_1.Role.ADMIN, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => {
    const target = await db.user.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId }, include: { driverProfile: true } });
    if (!target)
        throw Object.assign(new Error('Team member not found'), { status: 404 });
    if (target.role === client_1.Role.OWNER)
        return res.status(403).json({ message: 'Owner access cannot be changed' });
    const data = parse(zod_1.z.object({ role: zod_1.z.enum(client_1.Role).refine(r => r !== client_1.Role.OWNER && r !== client_1.Role.DRIVER, 'Driver roles are managed through Driver Access').optional(), isActive: zod_1.z.boolean().optional(), password: zod_1.z.string().min(10).regex(/[A-Z]/).regex(/[0-9]/).optional() }), req.body);
    if (req.user.role === client_1.Role.FLEET_MANAGER && target.role !== client_1.Role.DRIVER)
        return res.status(403).json({ message: 'Fleet Managers can manage driver access only' });
    if (target.role === client_1.Role.DRIVER && data.role)
        return res.status(409).json({ message: 'A linked Driver role cannot be changed' });
    if (req.user.role === client_1.Role.ADMIN && (target.role === client_1.Role.ADMIN || data.role === client_1.Role.ADMIN))
        return res.status(403).json({ message: 'Only the Owner can manage Admin access' });
    const updated = await db.$transaction(async (tx) => {
        if (target.driverProfile && data.isActive !== undefined) {
            let status = client_1.DriverStatus.SUSPENDED;
            if (data.isActive) {
                const activeTrip = await tx.trip.count({ where: { driverId: target.driverProfile.id, status: { in: [client_1.TripStatus.DISPATCHED, client_1.TripStatus.IN_PROGRESS] } } });
                status = activeTrip ? client_1.DriverStatus.ON_TRIP : target.driverProfile.onboardingStatus === client_1.DriverOnboardingStatus.VERIFIED ? client_1.DriverStatus.AVAILABLE : client_1.DriverStatus.OFF_DUTY;
            }
            await tx.driver.update({ where: { id: target.driverProfile.id }, data: { status } });
        }
        return tx.user.update({ where: { id: target.id }, data: { role: data.role, isActive: data.isActive, ...(data.password ? { passwordHash: await bcryptjs_1.default.hash(data.password, 12), mustChangePassword: true } : {}) }, select: { id: true, name: true, email: true, role: true, isActive: true, mustChangePassword: true, lastLoginAt: true, lastActiveAt: true, createdAt: true, googleSub: true, driverProfile: { select: { id: true, onboardingStatus: true, status: true } } } });
    });
    res.json(updated);
}));
app.get('/api/dashboard', allow(client_1.Role.FLEET_MANAGER, client_1.Role.DISPATCHER, client_1.Role.SAFETY_OFFICER, client_1.Role.FINANCIAL_ANALYST), asyncRoute(async (req, res) => {
    const [vehicles, drivers, trips, recentTrips] = await Promise.all([
        db.vehicle.groupBy({ by: ['status'], where: { organizationId: req.user.organizationId }, _count: true }), db.driver.groupBy({ by: ['status'], where: { organizationId: req.user.organizationId }, _count: true }), db.trip.groupBy({ by: ['status'], where: { organizationId: req.user.organizationId }, _count: true }),
        db.trip.findMany({ where: { organizationId: req.user.organizationId }, take: 6, orderBy: { createdAt: 'desc' }, include: { vehicle: true, driver: true } })
    ]);
    const vc = Object.fromEntries(vehicles.map(x => [x.status, x._count]));
    const dc = Object.fromEntries(drivers.map(x => [x.status, x._count]));
    const tc = Object.fromEntries(trips.map(x => [x.status, x._count]));
    const active = (vc.AVAILABLE || 0) + (vc.ON_TRIP || 0) + (vc.IN_SHOP || 0);
    const utilized = vc.ON_TRIP || 0;
    res.json({ kpis: { activeVehicles: active, availableVehicles: vc.AVAILABLE || 0, inMaintenance: vc.IN_SHOP || 0, activeTrips: (tc.DISPATCHED || 0) + (tc.IN_PROGRESS || 0), pendingTrips: tc.DRAFT || 0, driversOnDuty: dc.ON_TRIP || 0, fleetUtilization: active ? Math.round(utilized / active * 100) : 0 }, vehicleStatus: vc, recentTrips });
}));
const vehicleSchema = zod_1.z.object({ registrationNo: zod_1.z.string().min(3), name: zod_1.z.string().min(2), type: zod_1.z.string().min(2), capacityKg: zod_1.z.coerce.number().positive(), requiredLicenseCategory: zod_1.z.enum(client_1.LicenseCategory).default(client_1.LicenseCategory.LMV), odometerKm: zod_1.z.coerce.number().nonnegative(), acquisitionCost: zod_1.z.coerce.number().nonnegative(), status: zod_1.z.enum(client_1.VehicleStatus).default(client_1.VehicleStatus.AVAILABLE), region: zod_1.z.string().default('Central') });
const fastagConnectionSchema = zod_1.z.object({ provider: zod_1.z.string().trim().min(2).max(80), issuerName: zod_1.z.string().trim().min(2).max(120), maskedTagId: zod_1.z.string().trim().max(80).optional(), externalCustomerId: zod_1.z.string().trim().max(120).optional() });
const vehicleRegistrationSchema = vehicleSchema.extend({ fastag: fastagConnectionSchema.optional() });
app.get('/api/vehicles', allow(client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => {
    const q = String(req.query.q || '');
    const status = req.query.status;
    const type = String(req.query.type || '');
    res.json(await db.vehicle.findMany({ where: { AND: [{ organizationId: req.user.organizationId }, q ? { OR: [{ registrationNo: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : {}, status ? { status } : {}, type ? { type } : {}] }, include: { fastagConnection: true }, orderBy: { createdAt: 'desc' } }));
}));
app.get('/api/vehicles/available', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => res.json(await db.vehicle.findMany({ where: { organizationId: req.user.organizationId, status: client_1.VehicleStatus.AVAILABLE }, orderBy: { name: 'asc' } }))));
app.post('/api/vehicles', allow(client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => {
    const { fastag, ...vehicle } = parse(vehicleRegistrationSchema, req.body);
    const created = await db.$transaction(async (tx) => {
        const row = await tx.vehicle.create({ data: { ...vehicle, organizationId: req.user.organizationId } });
        if (fastag)
            await tx.fastagConnection.create({ data: { ...fastag, organizationId: req.user.organizationId, vehicleId: row.id, status: client_1.FastagConnectionStatus.PENDING } });
        return tx.vehicle.findUniqueOrThrow({ where: { id: row.id }, include: { fastagConnection: true } });
    });
    res.status(201).json(created);
}));
app.put('/api/vehicles/:id', allow(client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { const row = await db.vehicle.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId } }); if (!row)
    throw Object.assign(new Error('Vehicle not found'), { status: 404 }); res.json(await db.vehicle.update({ where: { id: row.id }, data: parse(vehicleSchema.partial(), req.body) })); }));
app.delete('/api/vehicles/:id', allow(client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { const row = await db.vehicle.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId } }); if (!row)
    throw Object.assign(new Error('Vehicle not found'), { status: 404 }); await db.vehicle.delete({ where: { id: row.id } }); res.status(204).end(); }));
app.get('/api/fastag/connections', allow(client_1.Role.FLEET_MANAGER, client_1.Role.FINANCIAL_ANALYST, client_1.Role.DISPATCHER), asyncRoute(async (req, res) => res.json(await db.fastagConnection.findMany({ where: { organizationId: req.user.organizationId }, include: { vehicle: true, _count: { select: { transactions: true } } }, orderBy: { updatedAt: 'desc' } }))));
app.get('/api/fastag/vehicles', allow(client_1.Role.FLEET_MANAGER, client_1.Role.FINANCIAL_ANALYST), asyncRoute(async (req, res) => res.json(await db.vehicle.findMany({ where: { organizationId: req.user.organizationId }, select: { id: true, name: true, registrationNo: true }, orderBy: { registrationNo: 'asc' } }))));
app.get('/api/fastag/matchable-trips', allow(client_1.Role.FLEET_MANAGER, client_1.Role.FINANCIAL_ANALYST, client_1.Role.DISPATCHER), asyncRoute(async (req, res) => res.json(await db.trip.findMany({ where: { organizationId: req.user.organizationId, status: { in: [client_1.TripStatus.DISPATCHED, client_1.TripStatus.IN_PROGRESS, client_1.TripStatus.COMPLETED] } }, select: { id: true, tripNo: true, source: true, destination: true, vehicle: { select: { id: true } } }, orderBy: { createdAt: 'desc' }, take: 500 }))));
app.post('/api/vehicles/:id/fastag', allow(client_1.Role.FLEET_MANAGER, client_1.Role.FINANCIAL_ANALYST), asyncRoute(async (req, res) => { const vehicle = await db.vehicle.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId } }); if (!vehicle)
    throw Object.assign(new Error('Vehicle not found'), { status: 404 }); const data = parse(fastagConnectionSchema, req.body); res.status(201).json(await db.fastagConnection.upsert({ where: { vehicleId: vehicle.id }, create: { ...data, organizationId: req.user.organizationId, vehicleId: vehicle.id, status: client_1.FastagConnectionStatus.PENDING }, update: { ...data, status: client_1.FastagConnectionStatus.PENDING, lastError: null }, include: { vehicle: true } })); }));
app.post('/api/vehicles/:id/fastag/disconnect', allow(client_1.Role.FLEET_MANAGER, client_1.Role.FINANCIAL_ANALYST), asyncRoute(async (req, res) => { const connection = await db.fastagConnection.findFirst({ where: { vehicleId: idParam(req), organizationId: req.user.organizationId } }); if (!connection)
    throw Object.assign(new Error('FASTag connection not found'), { status: 404 }); res.json(await db.fastagConnection.update({ where: { id: connection.id }, data: { status: client_1.FastagConnectionStatus.DISCONNECTED }, include: { vehicle: true } })); }));
app.post('/api/vehicles/:id/fastag/transactions', allow(client_1.Role.FLEET_MANAGER, client_1.Role.FINANCIAL_ANALYST), asyncRoute(async (req, res) => { const connection = await db.fastagConnection.findFirst({ where: { vehicleId: idParam(req), organizationId: req.user.organizationId, status: { not: client_1.FastagConnectionStatus.DISCONNECTED } } }); if (!connection)
    throw Object.assign(new Error('Connect this vehicle to its FASTag issuer first'), { status: 409 }); const data = parse(fastagTransactionSchema, req.body); res.status(201).json(await ingestFastagTransaction(connection.id, data, req.body)); }));
app.post('/api/vehicles/:id/fastag/sync', allow(client_1.Role.FLEET_MANAGER, client_1.Role.FINANCIAL_ANALYST), asyncRoute(async (req, res) => { const connection = await db.fastagConnection.findFirst({ where: { vehicleId: idParam(req), organizationId: req.user.organizationId, status: { not: client_1.FastagConnectionStatus.DISCONNECTED } }, include: { vehicle: true } }); if (!connection)
    throw Object.assign(new Error('Connected FASTag account not found'), { status: 404 }); const base = process.env.FASTAG_PROVIDER_BASE_URL?.replace(/\/$/, ''); const token = process.env.FASTAG_PROVIDER_API_TOKEN; if (!base || !token)
    throw Object.assign(new Error('Live issuer synchronization is not configured. Webhook and statement ingestion remain available.'), { status: 503 }); try {
    const response = await fetch(`${base}/transactions?vehicleRegistrationNo=${encodeURIComponent(normalizeRegistration(connection.vehicle.registrationNo))}&since=${encodeURIComponent((connection.lastSyncedAt || new Date(Date.now() - 7 * 86400_000)).toISOString())}`, { headers: { Authorization: `Bearer ${token}`, 'X-Customer-Reference': connection.externalCustomerId || '' }, signal: AbortSignal.timeout(10000) });
    if (!response.ok)
        throw new Error(`Issuer returned ${response.status}`);
    const payload = await response.json();
    const rows = [];
    for (const item of payload.transactions || []) {
        const data = parse(fastagTransactionSchema, item);
        rows.push(await ingestFastagTransaction(connection.id, data, item));
    }
    if (!rows.length)
        await db.fastagConnection.update({ where: { id: connection.id }, data: { status: client_1.FastagConnectionStatus.ACTIVE, lastSyncedAt: new Date(), lastError: null } });
    res.json({ synchronized: rows.length, transactions: rows });
}
catch (error) {
    await db.fastagConnection.update({ where: { id: connection.id }, data: { status: client_1.FastagConnectionStatus.ERROR, lastError: error.message } });
    throw Object.assign(new Error('FASTag issuer synchronization failed. Existing accounting data was not changed.'), { status: 503 });
} }));
app.get('/api/fastag/transactions', allow(client_1.Role.FLEET_MANAGER, client_1.Role.FINANCIAL_ANALYST, client_1.Role.DISPATCHER), asyncRoute(async (req, res) => { const matchStatus = req.query.matchStatus ? parse(zod_1.z.enum(client_1.TollMatchStatus), String(req.query.matchStatus)) : undefined; const transactions = await db.fastagTransaction.findMany({ where: { organizationId: req.user.organizationId, ...(matchStatus ? { matchStatus } : {}) }, include: { vehicle: true, trip: { select: { id: true, tripNo: true, source: true, destination: true } }, expense: true, connection: true }, orderBy: { occurredAt: 'desc' }, take: 250 }); res.json(transactions.map(({ rawPayload, ...transaction }) => transaction)); }));
app.post('/api/fastag/transactions/:id/match', allow(client_1.Role.FLEET_MANAGER, client_1.Role.FINANCIAL_ANALYST), asyncRoute(async (req, res) => { const transaction = await db.fastagTransaction.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId } }); if (!transaction)
    throw Object.assign(new Error('FASTag transaction not found'), { status: 404 }); const { tripId } = parse(zod_1.z.object({ tripId: zod_1.z.string().nullable() }), req.body); res.json(await reconcileFastagTransaction(transaction.id, tripId)); }));
async function pollFastagProviders() { const base = process.env.FASTAG_PROVIDER_BASE_URL?.replace(/\/$/, ''), token = process.env.FASTAG_PROVIDER_API_TOKEN; if (!base || !token)
    return; const connections = await db.fastagConnection.findMany({ where: { status: { in: [client_1.FastagConnectionStatus.PENDING, client_1.FastagConnectionStatus.ACTIVE, client_1.FastagConnectionStatus.ERROR] } }, include: { vehicle: true } }); for (const connection of connections) {
    try {
        const response = await fetch(`${base}/transactions?vehicleRegistrationNo=${encodeURIComponent(normalizeRegistration(connection.vehicle.registrationNo))}&since=${encodeURIComponent((connection.lastSyncedAt || new Date(Date.now() - 7 * 86400_000)).toISOString())}`, { headers: { Authorization: `Bearer ${token}`, 'X-Customer-Reference': connection.externalCustomerId || '' }, signal: AbortSignal.timeout(10000) });
        if (!response.ok)
            throw new Error(`Issuer returned ${response.status}`);
        const payload = await response.json();
        for (const item of payload.transactions || [])
            await ingestFastagTransaction(connection.id, parse(fastagTransactionSchema, item), item);
        if (!payload.transactions?.length)
            await db.fastagConnection.update({ where: { id: connection.id }, data: { status: client_1.FastagConnectionStatus.ACTIVE, lastSyncedAt: new Date(), lastError: null } });
    }
    catch (error) {
        await db.fastagConnection.update({ where: { id: connection.id }, data: { status: client_1.FastagConnectionStatus.ERROR, lastError: error.message } }).catch(() => undefined);
    }
} }
const driverSchema = zod_1.z.object({ name: zod_1.z.string().min(2), licenseNo: zod_1.z.string().min(3), licenseCategory: zod_1.z.string().min(2), licenseExpiry: zod_1.z.coerce.date(), contact: zod_1.z.string().min(7), safetyScore: zod_1.z.coerce.number().int().min(0).max(100), status: zod_1.z.enum(client_1.DriverStatus).default(client_1.DriverStatus.AVAILABLE) });
app.get('/api/drivers', allow(client_1.Role.FLEET_MANAGER, client_1.Role.SAFETY_OFFICER), asyncRoute(async (req, res) => { const q = String(req.query.q || ''); res.json(await db.driver.findMany({ where: { organizationId: req.user.organizationId, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { licenseNo: { contains: q, mode: 'insensitive' } }] } : {}) }, include: { user: { select: { email: true, isActive: true } }, _count: { select: { documents: true, trips: true } } }, orderBy: { createdAt: 'desc' } })); }));
app.get('/api/drivers/available', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => res.json(await db.driver.findMany({ where: { organizationId: req.user.organizationId, status: client_1.DriverStatus.AVAILABLE, licenseExpiry: { gt: new Date() } }, orderBy: { name: 'asc' } }))));
app.get('/api/drivers/:id', allow(client_1.Role.FLEET_MANAGER, client_1.Role.SAFETY_OFFICER, client_1.Role.DISPATCHER), asyncRoute(async (req, res) => {
    const driver = await db.driver.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId }, include: { user: { select: { email: true, isActive: true, lastLoginAt: true } }, documents: { orderBy: { createdAt: 'desc' } }, trips: { include: { vehicle: true }, orderBy: { createdAt: 'desc' }, take: 10 } } });
    if (!driver)
        throw Object.assign(new Error('Driver not found'), { status: 404 });
    const documents = await Promise.all(driver.documents.map(async (document) => ({ ...document, objectKey: undefined, url: (0, objectStorage_1.objectStorageConfigured)() ? await (0, objectStorage_1.signedObjectUrl)(document.objectKey) : null })));
    res.json({ ...driver, documents });
}));
app.post('/api/drivers/:id/approve', allow(client_1.Role.FLEET_MANAGER, client_1.Role.SAFETY_OFFICER), asyncRoute(async (req, res) => {
    const driver = await db.driver.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId }, include: { documents: true, user: true } });
    if (!driver)
        throw Object.assign(new Error('Driver not found'), { status: 404 });
    if (!driver.userId)
        throw Object.assign(new Error('Only a linked driver account can use digital approval'), { status: 409 });
    if (driver.onboardingStatus !== client_1.DriverOnboardingStatus.NEEDS_REVIEW)
        throw Object.assign(new Error('This driver has not submitted onboarding for review'), { status: 409 });
    const uploaded = new Set(driver.documents.map(document => document.type));
    if (!uploaded.has(client_1.DriverDocumentType.PROFILE_PHOTO) || !uploaded.has(client_1.DriverDocumentType.LICENSE_FRONT))
        throw Object.assign(new Error('Profile photo and licence front are required before approval'), { status: 409 });
    if (driver.licenseNo.startsWith('PENDING-') || driver.licenseExpiry <= new Date())
        throw Object.assign(new Error('Confirm a valid, unexpired driving licence before approval'), { status: 409 });
    res.json(await db.driver.update({ where: { id: driver.id }, data: { onboardingStatus: client_1.DriverOnboardingStatus.VERIFIED, status: client_1.DriverStatus.AVAILABLE, verifiedAt: new Date(), reviewedAt: new Date(), reviewedById: req.user.id, reviewNote: null }, include: { user: { select: { email: true, isActive: true, lastLoginAt: true } }, documents: true } }));
}));
app.post('/api/drivers/:id/reject', allow(client_1.Role.FLEET_MANAGER, client_1.Role.SAFETY_OFFICER), asyncRoute(async (req, res) => {
    const { reviewNote } = parse(zod_1.z.object({ reviewNote: zod_1.z.string().trim().min(10).max(500) }), req.body);
    const driver = await db.driver.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId, userId: { not: null } } });
    if (!driver)
        throw Object.assign(new Error('Linked driver not found'), { status: 404 });
    if (driver.onboardingStatus !== client_1.DriverOnboardingStatus.NEEDS_REVIEW)
        throw Object.assign(new Error('Only a submitted onboarding can be rejected'), { status: 409 });
    res.json(await db.driver.update({ where: { id: driver.id }, data: { onboardingStatus: client_1.DriverOnboardingStatus.REJECTED, status: client_1.DriverStatus.OFF_DUTY, verifiedAt: null, reviewedAt: new Date(), reviewedById: req.user.id, reviewNote } }));
}));
app.post('/api/drivers', allow(client_1.Role.FLEET_MANAGER, client_1.Role.SAFETY_OFFICER), asyncRoute(async (req, res) => res.status(201).json(await db.driver.create({ data: { ...parse(driverSchema, req.body), organizationId: req.user.organizationId } }))));
app.put('/api/drivers/:id', allow(client_1.Role.FLEET_MANAGER, client_1.Role.SAFETY_OFFICER), asyncRoute(async (req, res) => { const row = await db.driver.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId } }); if (!row)
    throw Object.assign(new Error('Driver not found'), { status: 404 }); res.json(await db.driver.update({ where: { id: row.id }, data: parse(driverSchema.partial(), req.body) })); }));
app.delete('/api/drivers/:id', allow(client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { const row = await db.driver.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId } }); if (!row)
    throw Object.assign(new Error('Driver not found'), { status: 404 }); if (row.userId)
    throw Object.assign(new Error('A driver with login access cannot be deleted; suspend the linked account instead'), { status: 409 }); await db.driver.delete({ where: { id: row.id } }); res.status(204).end(); }));
app.get('/api/driver/me', allow(client_1.Role.DRIVER), asyncRoute(async (req, res) => {
    if (!req.user.driverId)
        throw Object.assign(new Error('Driver profile is not linked to this account'), { status: 409 });
    const driver = await db.driver.findFirst({ where: { id: req.user.driverId, organizationId: req.user.organizationId }, include: { documents: { select: { id: true, type: true, createdAt: true, ocrConfidence: true } } } });
    if (!driver)
        throw Object.assign(new Error('Driver profile not found'), { status: 404 });
    res.json(driver);
}));
app.post('/api/driver/me/onboarding', allow(client_1.Role.DRIVER), upload.fields([{ name: 'profilePhoto', maxCount: 1 }, { name: 'licenseFront', maxCount: 1 }, { name: 'licenseBack', maxCount: 1 }]), asyncRoute(async (req, res) => {
    if (!req.user.driverId)
        throw Object.assign(new Error('Driver profile is not linked to this account'), { status: 409 });
    if (!(0, objectStorage_1.objectStorageConfigured)())
        throw Object.assign(new Error('Cloudflare R2 is not configured'), { status: 503 });
    const files = req.files;
    const profilePhoto = files?.profilePhoto?.[0], licenseFront = files?.licenseFront?.[0], licenseBack = files?.licenseBack?.[0];
    if (!profilePhoto || !licenseFront)
        throw Object.assign(new Error('Profile photo and driving-licence front image are required'), { status: 400 });
    const extraction = await (0, ocr_1.extractDrivingLicense)(licenseFront.buffer);
    const uploads = await Promise.all([
        (0, objectStorage_1.uploadPrivateObject)({ organizationId: req.user.organizationId, folder: `drivers/${req.user.driverId}/profile`, originalName: profilePhoto.originalname, mimeType: profilePhoto.mimetype, buffer: profilePhoto.buffer }),
        (0, objectStorage_1.uploadPrivateObject)({ organizationId: req.user.organizationId, folder: `drivers/${req.user.driverId}/license`, originalName: licenseFront.originalname, mimeType: licenseFront.mimetype, buffer: licenseFront.buffer }),
        licenseBack ? (0, objectStorage_1.uploadPrivateObject)({ organizationId: req.user.organizationId, folder: `drivers/${req.user.driverId}/license`, originalName: licenseBack.originalname, mimeType: licenseBack.mimetype, buffer: licenseBack.buffer }) : Promise.resolve(null)
    ]);
    const records = [{ type: client_1.DriverDocumentType.PROFILE_PHOTO, file: profilePhoto, key: uploads[0], extractedData: undefined, ocrConfidence: undefined }, { type: client_1.DriverDocumentType.LICENSE_FRONT, file: licenseFront, key: uploads[1], extractedData: JSON.parse(JSON.stringify(extraction)), ocrConfidence: extraction.confidence }, ...(licenseBack && uploads[2] ? [{ type: client_1.DriverDocumentType.LICENSE_BACK, file: licenseBack, key: uploads[2], extractedData: undefined, ocrConfidence: undefined }] : [])];
    await db.$transaction(async (tx) => { for (const record of records)
        await tx.driverDocument.upsert({ where: { driverId_type: { driverId: req.user.driverId, type: record.type } }, create: { organizationId: req.user.organizationId, driverId: req.user.driverId, type: record.type, objectKey: record.key, mimeType: record.file.mimetype, originalName: record.file.originalname, extractedData: record.extractedData, ocrConfidence: record.ocrConfidence }, update: { objectKey: record.key, mimeType: record.file.mimetype, originalName: record.file.originalname, extractedData: record.extractedData, ocrConfidence: record.ocrConfidence, createdAt: new Date() } }); await tx.driver.update({ where: { id: req.user.driverId }, data: { onboardingStatus: client_1.DriverOnboardingStatus.NEEDS_REVIEW, status: client_1.DriverStatus.OFF_DUTY, reviewNote: null, reviewedAt: null, reviewedById: null } }); });
    res.json({ onboardingStatus: client_1.DriverOnboardingStatus.NEEDS_REVIEW, extracted: { name: extraction.name, licenseNo: extraction.licenseNo, licenseCategory: extraction.licenseCategory, licenseExpiry: extraction.licenseExpiry, confidence: extraction.confidence } });
}));
app.post('/api/driver/me/onboarding/confirm', allow(client_1.Role.DRIVER), asyncRoute(async (req, res) => {
    if (!req.user.driverId)
        throw Object.assign(new Error('Driver profile is not linked to this account'), { status: 409 });
    const data = parse(zod_1.z.object({ name: zod_1.z.string().trim().min(2).max(80), licenseNo: zod_1.z.string().trim().min(5).max(30), licenseCategory: zod_1.z.string().trim().min(2).max(20), licenseExpiry: zod_1.z.coerce.date(), contact: zod_1.z.string().trim().min(7).max(20).optional() }), req.body);
    if (data.licenseExpiry <= new Date())
        throw Object.assign(new Error('Driving licence is expired'), { status: 400 });
    const requiredDocuments = await db.driverDocument.count({ where: { driverId: req.user.driverId, type: { in: [client_1.DriverDocumentType.PROFILE_PHOTO, client_1.DriverDocumentType.LICENSE_FRONT] } } });
    if (requiredDocuments < 2)
        throw Object.assign(new Error('Upload the required onboarding photographs first'), { status: 409 });
    const driver = await db.$transaction(async (tx) => { await tx.user.update({ where: { id: req.user.id }, data: { name: data.name } }); return tx.driver.update({ where: { id: req.user.driverId }, data: { ...data, onboardingStatus: client_1.DriverOnboardingStatus.NEEDS_REVIEW, status: client_1.DriverStatus.OFF_DUTY, verifiedAt: null, reviewedAt: null, reviewedById: null, reviewNote: null } }); });
    res.json(driver);
}));
const placeSchema = zod_1.z.object({ id: zod_1.z.string().min(2).max(180), name: zod_1.z.string().trim().min(2).max(180), label: zod_1.z.string().trim().min(2).max(300), city: zod_1.z.string().max(120).optional(), state: zod_1.z.string().max(120), latitude: zod_1.z.number().min(6).max(38), longitude: zod_1.z.number().min(68).max(98), provider: zod_1.z.enum(['GOOGLE', 'PHOTON', 'BUILT_IN']) });
const tripSchema = zod_1.z.object({ sourceLocation: placeSchema, destinationLocation: placeSchema, routeOptionId: zod_1.z.enum(['SHORTEST', 'FASTEST', 'TOLL_SAVER']), vehicleId: zod_1.z.string(), driverId: zod_1.z.string(), cargoWeightKg: zod_1.z.coerce.number().positive(), revenue: zod_1.z.coerce.number().nonnegative().default(0) });
async function getAssignmentContext(organizationId, vehicleId, driverId) { const [vehicle, driver, vehicleTrip, driverTrip, maintenance] = await Promise.all([db.vehicle.findFirst({ where: { id: vehicleId, organizationId } }), db.driver.findFirst({ where: { id: driverId, organizationId } }), db.trip.findFirst({ where: { organizationId, vehicleId, status: { in: [client_1.TripStatus.DISPATCHED, client_1.TripStatus.IN_PROGRESS] } }, select: { tripNo: true } }), db.trip.findFirst({ where: { organizationId, driverId, status: { in: [client_1.TripStatus.DISPATCHED, client_1.TripStatus.IN_PROGRESS] } }, select: { tripNo: true } }), db.maintenance.findFirst({ where: { organizationId, vehicleId, status: client_1.MaintenanceStatus.ACTIVE }, select: { serviceType: true } })]); return { vehicle, driver, vehicleTripNo: vehicleTrip?.tripNo, driverTripNo: driverTrip?.tripNo, maintenanceService: maintenance?.serviceType }; }
app.post('/api/trips/validate-assignment', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { const data = parse(tripSchema.pick({ vehicleId: true, driverId: true, cargoWeightKg: true }), req.body), context = await getAssignmentContext(req.user.organizationId, data.vehicleId, data.driverId); try {
    (0, assignmentEligibility_1.assertAssignmentEligible)({ ...context, cargoWeightKg: data.cargoWeightKg });
    res.json({ eligible: true, reasons: [] });
}
catch (error) {
    if (error instanceof assignmentEligibility_1.AssignmentEligibilityError)
        return res.json({ eligible: false, reasons: error.reasons });
    throw error;
} }));
app.get('/api/routing/places', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => {
    const query = parse(zod_1.z.string().trim().min(2).max(120), String(req.query.q || ''));
    res.json(await (0, routePlanning_1.searchPlaces)(query));
}));
app.post('/api/routing/estimate', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => {
    const { sourceLocation, destinationLocation, vehicleId } = parse(zod_1.z.object({ sourceLocation: placeSchema, destinationLocation: placeSchema, vehicleId: zod_1.z.string().optional() }), req.body);
    const vehicle = vehicleId ? await db.vehicle.findFirst({ where: { id: vehicleId, organizationId: req.user.organizationId } }) : null;
    if (vehicleId && !vehicle)
        throw Object.assign(new Error('Vehicle not found'), { status: 404 });
    res.json(await (0, routePlanning_1.estimateRoutes)(sourceLocation, destinationLocation, vehicle?.type));
}));
app.get('/api/trips', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => res.json(await db.trip.findMany({ where: { organizationId: req.user.organizationId }, include: { vehicle: true, driver: true }, orderBy: { createdAt: 'desc' } }))));
app.get('/api/trips/:id', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER, client_1.Role.SAFETY_OFFICER), asyncRoute(async (req, res) => {
    const trip = await db.trip.findFirst({
        where: { id: idParam(req), organizationId: req.user.organizationId },
        include: {
            vehicle: true,
            driver: {
                include: {
                    user: { select: { email: true, isActive: true, lastLoginAt: true } },
                    documents: { orderBy: { createdAt: 'desc' } },
                    _count: { select: { trips: true, documents: true } }
                }
            },
            evidence: { orderBy: { createdAt: 'desc' } },
            fuelLogs: { include: { driver: { select: { id: true, name: true } }, vehicle: { select: { id: true, name: true, registrationNo: true } } }, orderBy: { date: 'desc' } },
            expenses: { include: { driver: { select: { id: true, name: true } }, vehicle: { select: { id: true, name: true, registrationNo: true } } }, orderBy: { date: 'desc' } },
            maintenance: { include: { driver: { select: { id: true, name: true } }, vehicle: { select: { id: true, name: true, registrationNo: true } } }, orderBy: { startDate: 'desc' } },
            fastagTransactions: { include: { expense: true, connection: true }, orderBy: { occurredAt: 'desc' } }
        }
    });
    if (!trip)
        throw Object.assign(new Error('Trip not found'), { status: 404 });
    const [documents, evidence, fuelLogs, expenses, maintenance] = await Promise.all([
        Promise.all(trip.driver.documents.map(async (document) => { const { objectKey, ...safeDocument } = document; return { ...safeDocument, url: (0, objectStorage_1.objectStorageConfigured)() ? await (0, objectStorage_1.signedObjectUrl)(objectKey) : null }; })),
        Promise.all(trip.evidence.map(async (item) => { const { objectKey, ...safeItem } = item; return { ...safeItem, url: await signedPrivateUrl(objectKey) }; })),
        Promise.all(trip.fuelLogs.map(async (item) => { const { receiptObjectKey, ...safeItem } = item; return { ...safeItem, receiptUrl: await signedPrivateUrl(receiptObjectKey) }; })),
        Promise.all(trip.expenses.map(async (item) => { const { receiptObjectKey, ...safeItem } = item; return { ...safeItem, receiptUrl: await signedPrivateUrl(receiptObjectKey) }; })),
        Promise.all(trip.maintenance.map(async (item) => { const { objectKey, ...safeItem } = item; return { ...safeItem, photoUrl: await signedPrivateUrl(objectKey) }; }))
    ]);
    const fastagTransactions = trip.fastagTransactions.map(({ rawPayload, ...transaction }) => transaction);
    const actualToll = expenses.filter(item => item.type === client_1.ExpenseType.TOLL && item.source === client_1.RecordSource.FASTAG).reduce((sum, item) => sum + item.amount, 0);
    res.json({ ...trip, fastagTransactions, driver: { ...trip.driver, documents }, evidence, fuelLogs, expenses, maintenance, costSummary: { fuel: fuelLogs.reduce((sum, item) => sum + item.cost, 0), expenses: expenses.reduce((sum, item) => sum + item.amount, 0), maintenance: maintenance.reduce((sum, item) => sum + item.cost, 0), actualToll, tollVariance: actualToll - trip.estimatedToll } });
}));
app.post('/api/trips', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => {
    const data = parse(tripSchema, req.body), context = await getAssignmentContext(req.user.organizationId, data.vehicleId, data.driverId);
    (0, assignmentEligibility_1.assertAssignmentEligible)({ ...context, cargoWeightKg: data.cargoWeightKg });
    const v = context.vehicle, d = context.driver;
    if (d.userId && d.onboardingStatus !== client_1.DriverOnboardingStatus.VERIFIED)
        throw Object.assign(new Error('Driver onboarding must be verified before assignment'), { status: 409 });
    const estimate = await (0, routePlanning_1.estimateRoutes)(data.sourceLocation, data.destinationLocation, v.type);
    const selectedRoute = estimate.options.find(option => option.id === data.routeOptionId);
    if (!selectedRoute)
        throw Object.assign(new Error('Selected route option is no longer available'), { status: 409 });
    const tripNo = `TRP${String((await db.trip.count({ where: { organizationId: req.user.organizationId } })) + 1).padStart(4, '0')}`;
    res.status(201).json(await db.trip.create({ data: { source: estimate.source.label, destination: estimate.destination.label, sourceCityId: data.sourceLocation.id, destinationCityId: data.destinationLocation.id, sourceLatitude: data.sourceLocation.latitude, sourceLongitude: data.sourceLocation.longitude, destinationLatitude: data.destinationLocation.latitude, destinationLongitude: data.destinationLocation.longitude, vehicleId: data.vehicleId, driverId: data.driverId, cargoWeightKg: data.cargoWeightKg, revenue: data.revenue, plannedDistanceKm: selectedRoute.distanceKm, estimatedDurationMinutes: selectedRoute.durationMinutes, estimatedToll: selectedRoute.estimatedToll, routeStrategy: selectedRoute.strategy, routeLabel: selectedRoute.label, routeVia: selectedRoute.via, routeProvider: selectedRoute.provider, routePolyline: selectedRoute.polyline, tripNo, organizationId: req.user.organizationId }, include: { vehicle: true, driver: true } }));
}));
app.post('/api/trips/:id/dispatch', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => {
    const trip = await db.trip.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId }, include: { vehicle: true, driver: true } });
    if (!trip)
        throw Object.assign(new Error('Trip not found'), { status: 404 });
    const context = await getAssignmentContext(req.user.organizationId, trip.vehicleId, trip.driverId);
    (0, assignmentEligibility_1.assertAssignmentEligible)({ ...context, cargoWeightKg: trip.cargoWeightKg, tripStatus: trip.status });
    if (trip.driver.userId && trip.driver.onboardingStatus !== client_1.DriverOnboardingStatus.VERIFIED)
        throw Object.assign(new Error('Driver onboarding must be verified before dispatch'), { status: 409 });
    const result = await db.$transaction(async (tx) => { const vehicle = await tx.vehicle.updateMany({ where: { id: trip.vehicleId, organizationId: req.user.organizationId, status: client_1.VehicleStatus.AVAILABLE }, data: { status: client_1.VehicleStatus.ON_TRIP } }), driver = await tx.driver.updateMany({ where: { id: trip.driverId, organizationId: req.user.organizationId, status: client_1.DriverStatus.AVAILABLE, licenseExpiry: { gt: new Date() } }, data: { status: client_1.DriverStatus.ON_TRIP } }); if (vehicle.count !== 1 || driver.count !== 1)
        throw new assignmentEligibility_1.AssignmentEligibilityError([{ code: vehicle.count !== 1 ? 'VEHICLE_ON_TRIP' : 'DRIVER_ON_TRIP', field: vehicle.count !== 1 ? 'vehicleId' : 'driverId', message: 'Assignment availability changed while dispatching. Refresh and try again.' }]); return tx.trip.update({ where: { id: trip.id }, data: { status: client_1.TripStatus.DISPATCHED, dispatchedAt: new Date() }, include: { vehicle: true, driver: true } }); }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
    res.json(result);
}));
app.post('/api/trips/:id/complete', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => {
    const { finalOdometerKm, fuelConsumedL } = parse(zod_1.z.object({ finalOdometerKm: zod_1.z.coerce.number().positive(), fuelConsumedL: zod_1.z.coerce.number().positive() }), req.body);
    const trip = await db.trip.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId } });
    if (!trip || (trip.status !== client_1.TripStatus.DISPATCHED && trip.status !== client_1.TripStatus.IN_PROGRESS))
        throw Object.assign(new Error('Only dispatched or active trips can be completed'), { status: 409 });
    const result = await db.$transaction(async (tx) => { const reported = await tx.maintenance.count({ where: { vehicleId: trip.vehicleId, status: client_1.MaintenanceStatus.REPORTED } }); await tx.vehicle.update({ where: { id: trip.vehicleId }, data: { status: reported ? client_1.VehicleStatus.IN_SHOP : client_1.VehicleStatus.AVAILABLE, odometerKm: finalOdometerKm } }); if (reported)
        await tx.maintenance.updateMany({ where: { vehicleId: trip.vehicleId, status: client_1.MaintenanceStatus.REPORTED }, data: { status: client_1.MaintenanceStatus.ACTIVE } }); await tx.driver.update({ where: { id: trip.driverId }, data: { status: client_1.DriverStatus.AVAILABLE } }); return tx.trip.update({ where: { id: trip.id }, data: { status: client_1.TripStatus.COMPLETED, completedAt: new Date(), finalOdometerKm, fuelConsumedL }, include: { vehicle: true, driver: true, maintenance: true } }); });
    res.json(result);
}));
app.post('/api/trips/:id/cancel', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { const trip = await db.trip.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId } }); if (!trip || (trip.status !== client_1.TripStatus.DRAFT && trip.status !== client_1.TripStatus.DISPATCHED))
    throw Object.assign(new Error('Trip cannot be cancelled'), { status: 409 }); const wasLive = trip.status === client_1.TripStatus.DISPATCHED; const result = await db.$transaction(async (tx) => { if (wasLive) {
    await tx.vehicle.update({ where: { id: trip.vehicleId }, data: { status: client_1.VehicleStatus.AVAILABLE } });
    await tx.driver.update({ where: { id: trip.driverId }, data: { status: client_1.DriverStatus.AVAILABLE } });
} return tx.trip.update({ where: { id: trip.id }, data: { status: client_1.TripStatus.CANCELLED }, include: { vehicle: true, driver: true } }); }); res.json(result); }));
app.get('/api/driver/me/trips', allow(client_1.Role.DRIVER), asyncRoute(async (req, res) => { if (!req.user.driverId)
    throw Object.assign(new Error('Driver profile is not linked to this account'), { status: 409 }); res.json(await db.trip.findMany({ where: { organizationId: req.user.organizationId, driverId: req.user.driverId, status: { in: [client_1.TripStatus.DISPATCHED, client_1.TripStatus.IN_PROGRESS, client_1.TripStatus.COMPLETED] } }, include: { vehicle: true }, orderBy: { createdAt: 'desc' } })); }));
app.get('/api/driver/me/trips/:id', allow(client_1.Role.DRIVER), asyncRoute(async (req, res) => {
    if (!req.user.driverId)
        throw Object.assign(new Error('Driver profile is not linked to this account'), { status: 409 });
    const trip = await db.trip.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId, driverId: req.user.driverId }, include: { vehicle: { include: { maintenance: { where: { status: { in: [client_1.MaintenanceStatus.REPORTED, client_1.MaintenanceStatus.ACTIVE] } }, orderBy: { startDate: 'desc' }, take: 10 }, fastagConnection: true } }, evidence: { orderBy: { createdAt: 'desc' } }, fuelLogs: { orderBy: { date: 'desc' } }, expenses: { orderBy: { date: 'desc' } }, maintenance: { orderBy: { startDate: 'desc' } }, fastagTransactions: { orderBy: { occurredAt: 'desc' } } } });
    if (!trip)
        throw Object.assign(new Error('Assigned trip not found'), { status: 404 });
    const [evidence, fuelLogs, expenses, maintenance, vehicleMaintenance] = await Promise.all([
        Promise.all(trip.evidence.map(async (item) => { const { objectKey, ...safe } = item; return { ...safe, url: await signedPrivateUrl(objectKey) }; })),
        Promise.all(trip.fuelLogs.map(async (item) => { const { receiptObjectKey, ...safe } = item; return { ...safe, receiptUrl: await signedPrivateUrl(receiptObjectKey) }; })),
        Promise.all(trip.expenses.map(async (item) => { const { receiptObjectKey, ...safe } = item; return { ...safe, receiptUrl: await signedPrivateUrl(receiptObjectKey) }; })),
        Promise.all(trip.maintenance.map(async (item) => { const { objectKey, ...safe } = item; return { ...safe, photoUrl: await signedPrivateUrl(objectKey) }; })),
        Promise.all(trip.vehicle.maintenance.map(async (item) => { const { objectKey, ...safe } = item; return { ...safe, photoUrl: await signedPrivateUrl(objectKey) }; }))
    ]);
    const fastagTransactions = trip.fastagTransactions.map(({ rawPayload, ...transaction }) => transaction);
    const actualToll = expenses.filter(item => item.type === client_1.ExpenseType.TOLL && item.source === client_1.RecordSource.FASTAG).reduce((sum, item) => sum + item.amount, 0);
    res.json({ ...trip, fastagTransactions, vehicle: { ...trip.vehicle, maintenance: vehicleMaintenance }, evidence, fuelLogs, expenses, maintenance, costSummary: { fuel: fuelLogs.reduce((sum, item) => sum + item.cost, 0), expenses: expenses.reduce((sum, item) => sum + item.amount, 0), maintenance: maintenance.reduce((sum, item) => sum + item.cost, 0), actualToll, tollVariance: actualToll - trip.estimatedToll } });
}));
app.post('/api/driver/me/trips/:id/start', allow(client_1.Role.DRIVER), upload.single('odometerPhoto'), asyncRoute(async (req, res) => {
    if (!req.user.driverId)
        throw Object.assign(new Error('Driver profile is not linked to this account'), { status: 409 });
    const trip = await db.trip.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId, driverId: req.user.driverId }, include: { vehicle: true, driver: true, evidence: true } });
    if (!trip)
        throw Object.assign(new Error('Assigned trip not found'), { status: 404 });
    if (trip.status === client_1.TripStatus.IN_PROGRESS)
        return res.json(trip);
    if (trip.status !== client_1.TripStatus.DISPATCHED)
        throw Object.assign(new Error('Only a dispatched trip can be started'), { status: 409 });
    if (trip.driver.onboardingStatus !== client_1.DriverOnboardingStatus.VERIFIED)
        throw Object.assign(new Error('Complete driver verification before starting a trip'), { status: 409 });
    const { vehicleRegistrationNo, confirmedOdometerKm } = parse(zod_1.z.object({ vehicleRegistrationNo: zod_1.z.string().min(4), confirmedOdometerKm: zod_1.z.coerce.number().nonnegative().optional() }), req.body);
    if (normalizeRegistration(vehicleRegistrationNo) !== normalizeRegistration(trip.vehicle.registrationNo))
        throw Object.assign(new Error('Vehicle registration does not match the assigned vehicle'), { status: 409 });
    if (!req.file)
        throw Object.assign(new Error('An odometer photograph is required'), { status: 400 });
    const ocr = await (0, ocr_1.extractOdometer)(req.file.buffer).catch(() => ({ odometerKm: undefined, rawText: '', confidence: 0 }));
    const odometerKm = ocr.odometerKm ?? confirmedOdometerKm;
    if (odometerKm === undefined)
        throw Object.assign(new Error('Odometer could not be read. Confirm the reading and try again.'), { status: 422 });
    if (odometerKm < trip.vehicle.odometerKm)
        throw Object.assign(new Error(`Odometer reading cannot be below ${trip.vehicle.odometerKm} km`), { status: 400 });
    const objectKey = await (0, objectStorage_1.uploadPrivateObject)({ organizationId: req.user.organizationId, folder: `trips/${trip.id}/evidence`, originalName: req.file.originalname, mimeType: req.file.mimetype, buffer: req.file.buffer });
    const result = await db.$transaction(async (tx) => { await tx.tripEvidence.create({ data: { organizationId: req.user.organizationId, tripId: trip.id, driverId: req.user.driverId, vehicleId: trip.vehicleId, type: client_1.TripEvidenceType.ODOMETER_START, objectKey, mimeType: req.file.mimetype, originalName: req.file.originalname, extractedOdometerKm: odometerKm, ocrConfidence: ocr.confidence, registrationNo: trip.vehicle.registrationNo } }); return tx.trip.update({ where: { id: trip.id }, data: { status: client_1.TripStatus.IN_PROGRESS, startedAt: new Date(), startOdometerKm: odometerKm }, include: { vehicle: true, driver: true, evidence: true } }); });
    res.json(result);
}));
app.post('/api/driver/me/trips/:id/updates', allow(client_1.Role.DRIVER), upload.single('photo'), asyncRoute(async (req, res) => {
    if (!req.user.driverId)
        throw Object.assign(new Error('Driver profile is not linked to this account'), { status: 409 });
    const data = parse(zod_1.z.object({ note: zod_1.z.string().trim().min(2).max(500), latitude: zod_1.z.coerce.number().min(-90).max(90).optional(), longitude: zod_1.z.coerce.number().min(-180).max(180).optional(), clientRequestId: zod_1.z.string().trim().min(8).max(100) }), req.body);
    const trip = await db.trip.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId, driverId: req.user.driverId } });
    if (!trip)
        throw Object.assign(new Error('Assigned trip not found'), { status: 404 });
    if (trip.status !== client_1.TripStatus.IN_PROGRESS)
        throw Object.assign(new Error('On-site updates are allowed only during an active trip'), { status: 409 });
    const existing = await db.tripEvidence.findUnique({ where: { clientRequestId: data.clientRequestId } });
    if (existing) {
        if (existing.organizationId !== req.user.organizationId || existing.driverId !== req.user.driverId)
            throw Object.assign(new Error('Invalid idempotency key'), { status: 409 });
        return res.json(existing);
    }
    const objectKey = req.file ? await (0, objectStorage_1.uploadPrivateObject)({ organizationId: req.user.organizationId, folder: `trips/${trip.id}/updates`, originalName: req.file.originalname, mimeType: req.file.mimetype, buffer: req.file.buffer }) : undefined;
    res.status(201).json(await db.tripEvidence.create({ data: { organizationId: req.user.organizationId, tripId: trip.id, driverId: req.user.driverId, vehicleId: trip.vehicleId, type: client_1.TripEvidenceType.SITE_UPDATE, note: data.note, latitude: data.latitude, longitude: data.longitude, clientRequestId: data.clientRequestId, objectKey, mimeType: req.file?.mimetype, originalName: req.file?.originalname } }));
}));
app.post('/api/driver/me/trips/:id/fuel', allow(client_1.Role.DRIVER), upload.single('fuelPhoto'), asyncRoute(async (req, res) => {
    if (!req.user.driverId)
        throw Object.assign(new Error('Driver profile is not linked to this account'), { status: 409 });
    const data = parse(zod_1.z.object({ liters: optionalPositiveNumber, confirmedLiters: optionalPositiveNumber, amount: optionalPositiveNumber, confirmedAmount: optionalPositiveNumber, odometerKm: zod_1.z.coerce.number().nonnegative(), fuelStation: zod_1.z.string().trim().max(120).optional(), clientRequestId: zod_1.z.string().trim().min(8).max(100) }), req.body);
    if (!req.file)
        throw Object.assign(new Error('A fuel pump or receipt photograph is required'), { status: 400 });
    const trip = await db.trip.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId, driverId: req.user.driverId }, include: { vehicle: true } });
    if (!trip)
        throw Object.assign(new Error('Assigned trip not found'), { status: 404 });
    if (trip.status !== client_1.TripStatus.IN_PROGRESS)
        throw Object.assign(new Error('Fuel can be logged only during an active trip'), { status: 409 });
    if (data.odometerKm < trip.vehicle.odometerKm)
        throw Object.assign(new Error(`Odometer reading cannot be below ${trip.vehicle.odometerKm} km`), { status: 400 });
    const existing = await db.fuelLog.findUnique({ where: { clientRequestId: data.clientRequestId } });
    if (existing) {
        if (existing.organizationId !== req.user.organizationId || existing.driverId !== req.user.driverId)
            throw Object.assign(new Error('Invalid idempotency key'), { status: 409 });
        return res.json({ ...existing, alreadyProcessed: true });
    }
    const ocr = await (0, ocr_1.extractReceipt)(req.file.buffer).catch(() => ({ amount: undefined, liters: undefined, vendor: undefined, date: undefined, rawText: '', confidence: 0 }));
    const liters = data.confirmedLiters ?? data.liters ?? ocr.liters;
    const amount = data.confirmedAmount ?? data.amount ?? ocr.amount;
    if (liters === undefined || amount === undefined)
        throw Object.assign(new Error('Fuel receipt OCR needs confirmation. Submit confirmed liters and amount.'), { status: 422 });
    if (liters > 2000)
        throw Object.assign(new Error('Fuel volume is outside the supported range'), { status: 400 });
    const objectKey = await (0, objectStorage_1.uploadPrivateObject)({ organizationId: req.user.organizationId, folder: `trips/${trip.id}/fuel`, originalName: req.file.originalname, mimeType: req.file.mimetype, buffer: req.file.buffer });
    const extractedData = JSON.parse(JSON.stringify(ocr));
    const result = await db.$transaction(async (tx) => { const fuelLog = await tx.fuelLog.create({ data: { organizationId: req.user.organizationId, vehicleId: trip.vehicleId, tripId: trip.id, driverId: req.user.driverId, liters, cost: amount, odometerKm: data.odometerKm, fuelStation: data.fuelStation || ocr.vendor, source: client_1.RecordSource.DRIVER_MOBILE, receiptObjectKey: objectKey, receiptMimeType: req.file.mimetype, receiptName: req.file.originalname, ocrConfidence: ocr.confidence, extractedData, clientRequestId: data.clientRequestId }, include: { vehicle: true, driver: true, trip: true } }); const evidence = await tx.tripEvidence.create({ data: { organizationId: req.user.organizationId, tripId: trip.id, driverId: req.user.driverId, vehicleId: trip.vehicleId, type: client_1.TripEvidenceType.FUEL_RECEIPT, objectKey, mimeType: req.file.mimetype, originalName: req.file.originalname, extractedOdometerKm: data.odometerKm, ocrConfidence: ocr.confidence, fuelLiters: liters, amount, fuelStation: data.fuelStation || ocr.vendor, clientRequestId: data.clientRequestId, note: (data.fuelStation || ocr.vendor) ? `Fuel at ${data.fuelStation || ocr.vendor}` : 'Fuel entry' } }); return { fuelLog: { ...fuelLog, receiptObjectKey: undefined, receiptUrl: await signedPrivateUrl(objectKey) }, evidence: { ...evidence, objectKey: undefined, url: await signedPrivateUrl(objectKey) }, extracted: { amount: ocr.amount, liters: ocr.liters, vendor: ocr.vendor, confidence: ocr.confidence } }; });
    res.status(201).json(result);
}));
app.post('/api/driver/me/trips/:id/expenses', allow(client_1.Role.DRIVER), upload.single('receiptPhoto'), asyncRoute(async (req, res) => {
    if (!req.user.driverId)
        throw Object.assign(new Error('Driver profile is not linked to this account'), { status: 409 });
    const data = parse(zod_1.z.object({ type: zod_1.z.enum(client_1.ExpenseType), amount: optionalPositiveNumber, confirmedAmount: optionalPositiveNumber, vendor: zod_1.z.string().trim().max(120).optional(), description: zod_1.z.string().trim().max(300).optional(), clientRequestId: zod_1.z.string().trim().min(8).max(100) }), req.body);
    if (!req.file)
        throw Object.assign(new Error('An expense receipt photograph is required'), { status: 400 });
    const trip = await db.trip.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId, driverId: req.user.driverId } });
    if (!trip)
        throw Object.assign(new Error('Assigned trip not found'), { status: 404 });
    if (trip.status !== client_1.TripStatus.IN_PROGRESS)
        throw Object.assign(new Error('Expenses can be logged only during an active trip'), { status: 409 });
    if (data.type === client_1.ExpenseType.TOLL && await db.fastagConnection.findFirst({ where: { vehicleId: trip.vehicleId, status: client_1.FastagConnectionStatus.ACTIVE } }))
        throw Object.assign(new Error('Toll receipts are disabled for this vehicle because FASTag expenses synchronize automatically.'), { status: 409 });
    const existing = await db.expense.findUnique({ where: { clientRequestId: data.clientRequestId } });
    if (existing) {
        if (existing.organizationId !== req.user.organizationId || existing.driverId !== req.user.driverId)
            throw Object.assign(new Error('Invalid idempotency key'), { status: 409 });
        return res.json({ ...existing, alreadyProcessed: true });
    }
    const ocr = await (0, ocr_1.extractReceipt)(req.file.buffer).catch(() => ({ amount: undefined, liters: undefined, vendor: undefined, date: undefined, rawText: '', confidence: 0 }));
    const amount = data.confirmedAmount ?? data.amount ?? ocr.amount;
    if (amount === undefined)
        throw Object.assign(new Error('Receipt OCR could not confirm the total. Submit confirmedAmount after driver review.'), { status: 422 });
    const objectKey = await (0, objectStorage_1.uploadPrivateObject)({ organizationId: req.user.organizationId, folder: `trips/${trip.id}/expenses`, originalName: req.file.originalname, mimeType: req.file.mimetype, buffer: req.file.buffer });
    const vendor = data.vendor || ocr.vendor;
    const extractedData = JSON.parse(JSON.stringify(ocr));
    const result = await db.$transaction(async (tx) => { const expense = await tx.expense.create({ data: { organizationId: req.user.organizationId, vehicleId: trip.vehicleId, tripId: trip.id, driverId: req.user.driverId, type: data.type, amount, vendor, description: data.description, source: client_1.RecordSource.DRIVER_MOBILE, receiptObjectKey: objectKey, receiptMimeType: req.file.mimetype, receiptName: req.file.originalname, ocrConfidence: ocr.confidence, extractedData, clientRequestId: data.clientRequestId }, include: { vehicle: true, driver: true, trip: true } }); const evidence = await tx.tripEvidence.create({ data: { organizationId: req.user.organizationId, tripId: trip.id, driverId: req.user.driverId, vehicleId: trip.vehicleId, type: client_1.TripEvidenceType.EXPENSE_RECEIPT, objectKey, mimeType: req.file.mimetype, originalName: req.file.originalname, ocrConfidence: ocr.confidence, amount, clientRequestId: data.clientRequestId, note: `${data.type}${vendor ? ` · ${vendor}` : ''}${data.description ? ` · ${data.description}` : ''}` } }); return { expense, evidence }; });
    res.status(201).json({ expense: { ...result.expense, receiptObjectKey: undefined, receiptUrl: await signedPrivateUrl(objectKey) }, evidence: { ...result.evidence, objectKey: undefined, url: await signedPrivateUrl(objectKey) }, extracted: { amount: ocr.amount, vendor: ocr.vendor, date: ocr.date, confidence: ocr.confidence } });
}));
app.post('/api/driver/me/trips/:id/maintenance', allow(client_1.Role.DRIVER), upload.single('photo'), asyncRoute(async (req, res) => {
    if (!req.user.driverId)
        throw Object.assign(new Error('Driver profile is not linked to this account'), { status: 409 });
    const data = parse(zod_1.z.object({ serviceType: zod_1.z.string().trim().min(2).max(100), description: zod_1.z.string().trim().min(5).max(500), severity: zod_1.z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']), odometerKm: optionalNonnegativeNumber, clientRequestId: zod_1.z.string().trim().min(8).max(100) }), req.body);
    const trip = await db.trip.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId, driverId: req.user.driverId }, include: { vehicle: true } });
    if (!trip)
        throw Object.assign(new Error('Assigned trip not found'), { status: 404 });
    if (trip.status !== client_1.TripStatus.DISPATCHED && trip.status !== client_1.TripStatus.IN_PROGRESS)
        throw Object.assign(new Error('Maintenance can be reported only for a dispatched or active trip'), { status: 409 });
    const existing = await db.maintenance.findUnique({ where: { clientRequestId: data.clientRequestId } });
    if (existing) {
        if (existing.organizationId !== req.user.organizationId || existing.driverId !== req.user.driverId)
            throw Object.assign(new Error('Invalid idempotency key'), { status: 409 });
        return res.json({ ...existing, alreadyProcessed: true });
    }
    const objectKey = req.file ? await (0, objectStorage_1.uploadPrivateObject)({ organizationId: req.user.organizationId, folder: `trips/${trip.id}/maintenance`, originalName: req.file.originalname, mimeType: req.file.mimetype, buffer: req.file.buffer }) : undefined;
    const report = await db.maintenance.create({ data: { organizationId: req.user.organizationId, vehicleId: trip.vehicleId, tripId: trip.id, driverId: req.user.driverId, serviceType: data.serviceType, description: data.description, severity: data.severity, reportedOdometerKm: data.odometerKm, source: client_1.RecordSource.DRIVER_MOBILE, status: client_1.MaintenanceStatus.REPORTED, objectKey, mimeType: req.file?.mimetype, originalName: req.file?.originalname, clientRequestId: data.clientRequestId }, include: { vehicle: true, driver: true, trip: true } });
    res.status(201).json({ ...report, objectKey: undefined, photoUrl: await signedPrivateUrl(objectKey) });
}));
const maintenanceSchema = zod_1.z.object({ vehicleId: zod_1.z.string(), serviceType: zod_1.z.string().min(2), description: zod_1.z.string().optional(), cost: zod_1.z.coerce.number().nonnegative() });
app.get('/api/maintenance', allow(client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => {
    const rows = await db.maintenance.findMany({ where: { organizationId: req.user.organizationId }, include: { vehicle: true, driver: { select: { id: true, name: true } }, trip: { select: { id: true, tripNo: true, source: true, destination: true } } }, orderBy: { startDate: 'desc' } });
    const safeRows = await Promise.all(rows.map(async (row) => { const { objectKey, ...safe } = row; return { ...safe, photoUrl: await signedPrivateUrl(objectKey) }; }));
    res.json(safeRows);
}));
app.post('/api/maintenance', allow(client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { const data = parse(maintenanceSchema, req.body); const v = await db.vehicle.findFirst({ where: { id: data.vehicleId, organizationId: req.user.organizationId } }); if (!v || v.status !== client_1.VehicleStatus.AVAILABLE)
    throw Object.assign(new Error('Only available vehicles can enter maintenance'), { status: 409 }); const result = await db.$transaction(async (tx) => { await tx.vehicle.update({ where: { id: v.id }, data: { status: client_1.VehicleStatus.IN_SHOP } }); return tx.maintenance.create({ data: { ...data, organizationId: req.user.organizationId, source: client_1.RecordSource.WEB, status: client_1.MaintenanceStatus.ACTIVE }, include: { vehicle: true } }); }); res.status(201).json(result); }));
app.post('/api/maintenance/:id/start', allow(client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { const m = await db.maintenance.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId }, include: { vehicle: true } }); if (!m || m.status !== client_1.MaintenanceStatus.REPORTED)
    throw Object.assign(new Error('Reported maintenance item not found'), { status: 404 }); if (m.vehicle.status === client_1.VehicleStatus.ON_TRIP)
    throw Object.assign(new Error('The report is synchronized, but workshop service can start only after the active trip is completed'), { status: 409 }); if (m.vehicle.status === client_1.VehicleStatus.RETIRED)
    throw Object.assign(new Error('A retired vehicle cannot enter maintenance'), { status: 409 }); const result = await db.$transaction(async (tx) => { await tx.vehicle.update({ where: { id: m.vehicleId }, data: { status: client_1.VehicleStatus.IN_SHOP } }); return tx.maintenance.update({ where: { id: m.id }, data: { status: client_1.MaintenanceStatus.ACTIVE }, include: { vehicle: true, driver: true, trip: true } }); }); res.json(result); }));
app.post('/api/maintenance/:id/close', allow(client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { const m = await db.maintenance.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId }, include: { vehicle: true } }); if (!m || (m.status !== client_1.MaintenanceStatus.ACTIVE && m.status !== client_1.MaintenanceStatus.REPORTED))
    throw Object.assign(new Error('Open maintenance record not found'), { status: 404 }); const result = await db.$transaction(async (tx) => { if (m.status === client_1.MaintenanceStatus.ACTIVE && m.vehicle.status !== client_1.VehicleStatus.RETIRED)
    await tx.vehicle.update({ where: { id: m.vehicleId }, data: { status: client_1.VehicleStatus.AVAILABLE } }); return tx.maintenance.update({ where: { id: m.id }, data: { status: client_1.MaintenanceStatus.CLOSED, endDate: new Date() }, include: { vehicle: true, driver: true, trip: true } }); }); res.json(result); }));
app.get('/api/finance', allow(client_1.Role.FINANCIAL_ANALYST, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { const where = { organizationId: req.user.organizationId }; const [rawFuelLogs, rawExpenses] = await Promise.all([db.fuelLog.findMany({ where, include: { vehicle: true, driver: { select: { id: true, name: true } }, trip: { select: { id: true, tripNo: true, source: true, destination: true } } }, orderBy: { date: 'desc' } }), db.expense.findMany({ where, include: { vehicle: true, driver: { select: { id: true, name: true } }, trip: { select: { id: true, tripNo: true, source: true, destination: true } } }, orderBy: { date: 'desc' } })]); const [fuelLogs, expenses] = await Promise.all([Promise.all(rawFuelLogs.map(async (item) => { const { receiptObjectKey, ...safe } = item; return { ...safe, receiptUrl: await signedPrivateUrl(receiptObjectKey) }; })), Promise.all(rawExpenses.map(async (item) => { const { receiptObjectKey, ...safe } = item; return { ...safe, receiptUrl: await signedPrivateUrl(receiptObjectKey) }; }))]); const driverTotals = new Map(), tripTotals = new Map(); for (const item of fuelLogs) {
    const dk = item.driverId || 'unassigned', d = driverTotals.get(dk) || { driverId: item.driverId, driverName: item.driver?.name || 'Unassigned', fuel: 0, expenses: 0, total: 0 };
    d.fuel += item.cost;
    d.total += item.cost;
    driverTotals.set(dk, d);
    const tk = item.tripId || 'unassigned', t = tripTotals.get(tk) || { tripId: item.tripId, tripNo: item.trip?.tripNo || 'Unassigned', route: item.trip ? `${item.trip.source} → ${item.trip.destination}` : 'No trip', fuel: 0, expenses: 0, total: 0 };
    t.fuel += item.cost;
    t.total += item.cost;
    tripTotals.set(tk, t);
} for (const item of expenses) {
    const dk = item.driverId || 'unassigned', d = driverTotals.get(dk) || { driverId: item.driverId, driverName: item.driver?.name || 'Unassigned', fuel: 0, expenses: 0, total: 0 };
    d.expenses += item.amount;
    d.total += item.amount;
    driverTotals.set(dk, d);
    const tk = item.tripId || 'unassigned', t = tripTotals.get(tk) || { tripId: item.tripId, tripNo: item.trip?.tripNo || 'Unassigned', route: item.trip ? `${item.trip.source} → ${item.trip.destination}` : 'No trip', fuel: 0, expenses: 0, total: 0 };
    t.expenses += item.amount;
    t.total += item.amount;
    tripTotals.set(tk, t);
} res.json({ fuelLogs, expenses, byDriver: [...driverTotals.values()].sort((a, b) => b.total - a.total), byTrip: [...tripTotals.values()].sort((a, b) => b.total - a.total) }); }));
app.post('/api/fuel', allow(client_1.Role.FINANCIAL_ANALYST, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { const data = parse(zod_1.z.object({ vehicleId: zod_1.z.string(), liters: zod_1.z.coerce.number().positive(), cost: zod_1.z.coerce.number().positive(), date: zod_1.z.coerce.date().optional(), odometerKm: zod_1.z.coerce.number().positive().optional() }), req.body); const vehicle = await db.vehicle.findFirst({ where: { id: data.vehicleId, organizationId: req.user.organizationId } }); if (!vehicle)
    throw Object.assign(new Error('Vehicle not found'), { status: 404 }); res.status(201).json(await db.fuelLog.create({ data: { ...data, source: client_1.RecordSource.WEB, organizationId: req.user.organizationId }, include: { vehicle: true } })); }));
app.post('/api/expenses', allow(client_1.Role.FINANCIAL_ANALYST, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { const data = parse(zod_1.z.object({ vehicleId: zod_1.z.string(), type: zod_1.z.enum(client_1.ExpenseType), description: zod_1.z.string().optional(), amount: zod_1.z.coerce.number().positive(), date: zod_1.z.coerce.date().optional() }), req.body); const vehicle = await db.vehicle.findFirst({ where: { id: data.vehicleId, organizationId: req.user.organizationId } }); if (!vehicle)
    throw Object.assign(new Error('Vehicle not found'), { status: 404 }); res.status(201).json(await db.expense.create({ data: { ...data, source: client_1.RecordSource.WEB, organizationId: req.user.organizationId }, include: { vehicle: true } })); }));
async function analytics(organizationId) {
    const where = { organizationId };
    const [vehicles, fuel, maintenance, expenses, trips] = await Promise.all([db.vehicle.findMany({ where }), db.fuelLog.findMany({ where }), db.maintenance.findMany({ where }), db.expense.findMany({ where }), db.trip.findMany({ where })]);
    const totalFuel = fuel.reduce((s, x) => s + x.cost, 0), totalMaintenance = maintenance.reduce((s, x) => s + x.cost, 0), totalOther = expenses.reduce((s, x) => s + x.amount, 0), liters = fuel.reduce((s, x) => s + x.liters, 0), distance = trips.filter(x => x.status === client_1.TripStatus.COMPLETED).reduce((s, x) => s + x.plannedDistanceKm, 0), revenue = trips.reduce((s, x) => s + x.revenue, 0), acquisition = vehicles.reduce((s, x) => s + x.acquisitionCost, 0), active = vehicles.filter(x => x.status !== client_1.VehicleStatus.RETIRED).length;
    const byVehicle = vehicles.map(v => { const vf = fuel.filter(x => x.vehicleId === v.id).reduce((s, x) => s + x.cost, 0), vm = maintenance.filter(x => x.vehicleId === v.id).reduce((s, x) => s + x.cost, 0), ve = expenses.filter(x => x.vehicleId === v.id).reduce((s, x) => s + x.amount, 0), vr = trips.filter(x => x.vehicleId === v.id).reduce((s, x) => s + x.revenue, 0); return { id: v.id, name: v.name, registrationNo: v.registrationNo, operationalCost: vf + vm + ve, roi: v.acquisitionCost ? ((vr - vf - vm) / v.acquisitionCost) * 100 : 0 }; });
    return { summary: { fuelEfficiency: liters ? distance / liters : 0, fleetUtilization: active ? vehicles.filter(x => x.status === client_1.VehicleStatus.ON_TRIP).length / active * 100 : 0, operationalCost: totalFuel + totalMaintenance + totalOther, vehicleRoi: acquisition ? (revenue - totalFuel - totalMaintenance) / acquisition * 100 : 0 }, byVehicle };
}
app.get('/api/analytics', allow(), asyncRoute(async (req, res) => res.json(await analytics(req.user.organizationId))));
app.get('/api/analytics/export.csv', asyncRoute(async (req, res) => { const a = await analytics(req.user.organizationId); const csv = ['Vehicle,Registration,Operational Cost,ROI %', ...a.byVehicle.map(x => `"${x.name}","${x.registrationNo}",${x.operationalCost.toFixed(2)},${x.roi.toFixed(2)}`)].join('\n'); res.type('text/csv').attachment('fleetpilot-analytics.csv').send(csv); }));
app.use((err, _req, res, _next) => { console.error(err); if (err instanceof assignmentEligibility_1.AssignmentEligibilityError)
    return res.status(err.status).json({ code: err.code, message: err.message, reasons: err.reasons }); if (err instanceof client_1.Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002')
        return res.status(409).json({ message: 'A record with this unique value already exists' });
    if (err.code === 'P2022')
        return res.status(503).json({ message: 'Database setup is incomplete. Please run the latest FleetPilot migration.' });
    return res.status(500).json({ message: 'The database could not complete this request' });
} if (err instanceof client_1.Prisma.PrismaClientValidationError)
    return res.status(400).json({ message: 'The request contains invalid data' }); res.status(err.status || 500).json({ message: err.status ? err.message : 'Something went wrong. Please try again.' }); });
app.listen(PORT, () => console.log(`TransitOps API running at http://localhost:${PORT}`));
const fastagPoller = setInterval(() => { void pollFastagProviders(); }, 5 * 60_000);
fastagPoller.unref();
process.on('SIGTERM', async () => { await db.$disconnect(); process.exit(0); });
