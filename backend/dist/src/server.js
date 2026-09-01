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
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const google_auth_library_1 = require("google-auth-library");
const assignmentEligibility_1 = require("./services/assignmentEligibility");
const tripProfitability_1 = require("./services/tripProfitability");
const historicalTollEstimate_1 = require("./services/historicalTollEstimate");
const routePlanning_1 = require("./constants/routePlanning");
const chat_1 = require("./chat/chat");
const security_1 = require("./chat/security");
const session_1 = require("./auth/session");
const db = new client_1.PrismaClient();
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT || 4000);
const SECRET = process.env.JWT_SECRET || 'development-only-change-me';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const tripProfitabilityConfig = (0, tripProfitability_1.loadTripProfitabilityConfig)();
const googleClient = new google_auth_library_1.OAuth2Client(GOOGLE_CLIENT_ID);
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map(origin => origin.trim());
const cookieOptions = (0, session_1.sessionCookieOptions)(process.env.NODE_ENV === 'production');
app.use((_req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()'); res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'"); res.setHeader('Cross-Origin-Resource-Policy', 'same-site'); next(); });
app.use((0, cors_1.default)({ origin: (origin, callback) => !origin || allowedOrigins.includes(origin) ? callback(null, true) : callback(Object.assign(new Error('Origin is not allowed by CORS'), { status: 403 })), credentials: true }));
app.use(express_1.default.json());
app.use('/api', (req, res, next) => { if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !req.headers.origin || allowedOrigins.includes(req.headers.origin))
    return next(); res.status(403).json({ message: 'Request origin is not allowed' }); });
const asyncRoute = (fn) => (req, res, next) => { Promise.resolve(fn(req, res, next)).catch(next); };
const authenticate = asyncRoute(async (req, res, next) => {
    const token = (0, session_1.sessionToken)({ authorization: req.headers.authorization, cookie: req.headers.cookie });
    if (!token)
        return res.status(401).json({ message: 'Authentication required' });
    try {
        const claims = jsonwebtoken_1.default.verify(token, SECRET);
        const account = await db.user.findUnique({ where: { id: claims.id }, include: { organization: true } });
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
const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role, organizationId: user.organizationId, organizationName: user.organization.name });
const sendSession = (res, user, status = 200) => { res.cookie(session_1.SESSION_COOKIE, jsonwebtoken_1.default.sign(user, SECRET, { expiresIn: '8h' }), cookieOptions); res.setHeader('Cache-Control', 'no-store'); return res.status(status).json({ user }); };
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'TransitOps API' }));
app.post('/api/auth/login', asyncRoute(async (req, res) => {
    const { email, password } = parse(zod_1.z.object({ email: zod_1.z.email(), password: zod_1.z.string().min(8) }), req.body);
    const user = await db.user.findUnique({ where: { email: email.toLowerCase() }, include: { organization: true } });
    if (!user || !user.passwordHash || !(await bcryptjs_1.default.compare(password, user.passwordHash)))
        return res.status(401).json({ message: 'Email or password is incorrect' });
    if (!user.isActive)
        return res.status(403).json({ message: 'Your account has been suspended. Contact your company administrator.' });
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lastActiveAt: new Date() } });
    sendSession(res, publicUser(user));
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
    sendSession(res, publicUser(user), 201);
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
    let user = await db.user.findUnique({ where: { email }, include: { organization: true } });
    if (!user) {
        if (intent !== 'register' || !companyName)
            return res.status(404).json({ message: 'No FleetPilot account found. Create your company workspace first.' });
        const base = slugify(companyName) || 'company';
        let slug = base;
        let suffix = 1;
        while (await db.organization.findUnique({ where: { slug } }))
            slug = `${base}-${++suffix}`;
        user = await db.$transaction(async (tx) => { const organization = await tx.organization.create({ data: { name: companyName, slug, operationsEmail: email } }); return tx.user.create({ data: { name: payload.name || email.split('@')[0], email, googleSub: payload.sub, role: client_1.Role.OWNER, organizationId: organization.id, lastLoginAt: new Date(), lastActiveAt: new Date() }, include: { organization: true } }); });
    }
    else {
        if (!user.isActive)
            return res.status(403).json({ message: 'Your account has been suspended. Contact your company administrator.' });
        if (user.googleSub && user.googleSub !== payload.sub)
            return res.status(409).json({ message: 'This email is linked to another Google identity' });
        user = await db.user.update({ where: { id: user.id }, data: { googleSub: payload.sub, lastLoginAt: new Date(), lastActiveAt: new Date() }, include: { organization: true } });
    }
    sendSession(res, publicUser(user));
}));
app.post('/api/auth/logout', (_req, res) => { const { maxAge: _maxAge, ...clearCookieOptions } = cookieOptions; res.clearCookie(session_1.SESSION_COOKIE, clearCookieOptions); res.status(204).end(); });
app.get('/api/auth/me', authenticate, (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ user: req.user }); });
app.use('/api', authenticate);
app.use('/api/chat', (0, chat_1.createChatRouter)(db));
app.get('/api/organization', asyncRoute(async (req, res) => res.json(await db.organization.findUnique({ where: { id: req.user.organizationId } }))));
app.put('/api/organization', allow(client_1.Role.OWNER, client_1.Role.ADMIN), asyncRoute(async (req, res) => { const data = parse(zod_1.z.object({ name: zod_1.z.string().trim().min(2).max(100), operationsEmail: zod_1.z.email().optional() }), req.body); res.json(await db.organization.update({ where: { id: req.user.organizationId }, data })); }));
app.get('/api/users', allow(client_1.Role.OWNER, client_1.Role.ADMIN), asyncRoute(async (req, res) => res.json(await db.user.findMany({ where: { organizationId: req.user.organizationId }, select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, lastActiveAt: true, createdAt: true, googleSub: true }, orderBy: { createdAt: 'asc' } }))));
app.post('/api/users', allow(client_1.Role.OWNER, client_1.Role.ADMIN), asyncRoute(async (req, res) => { const { name, email, password, role } = parse(zod_1.z.object({ name: zod_1.z.string().trim().min(2).max(80), email: zod_1.z.email(), password: zod_1.z.string().min(10).regex(/[A-Z]/).regex(/[0-9]/), role: zod_1.z.enum(client_1.Role).refine(r => r !== client_1.Role.OWNER, 'Owner access cannot be assigned here') }), req.body); if (req.user.role === client_1.Role.ADMIN && role === client_1.Role.ADMIN)
    return res.status(403).json({ message: 'Only the Owner can add another Admin' }); const passwordHash = await bcryptjs_1.default.hash(password, 12); res.status(201).json(await db.user.create({ data: { name, email: email.toLowerCase(), passwordHash, role, organizationId: req.user.organizationId }, select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true } })); }));
app.patch('/api/users/:id', allow(client_1.Role.OWNER, client_1.Role.ADMIN), asyncRoute(async (req, res) => { const target = await db.user.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId } }); if (!target)
    throw Object.assign(new Error('Team member not found'), { status: 404 }); if (target.role === client_1.Role.OWNER)
    return res.status(403).json({ message: 'Owner access cannot be changed' }); const data = parse(zod_1.z.object({ role: zod_1.z.enum(client_1.Role).refine(r => r !== client_1.Role.OWNER).optional(), isActive: zod_1.z.boolean().optional(), password: zod_1.z.string().min(10).regex(/[A-Z]/).regex(/[0-9]/).optional() }), req.body); if (req.user.role === client_1.Role.ADMIN && (target.role === client_1.Role.ADMIN || data.role === client_1.Role.ADMIN))
    return res.status(403).json({ message: 'Only the Owner can manage Admin access' }); res.json(await db.user.update({ where: { id: target.id }, data: { role: data.role, isActive: data.isActive, ...(data.password ? { passwordHash: await bcryptjs_1.default.hash(data.password, 12) } : {}) }, select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, lastActiveAt: true, createdAt: true, googleSub: true } })); }));
app.get('/api/dashboard', asyncRoute(async (req, res) => {
    const showRecentTrips = (0, security_1.disclosurePolicyForRole)(req.user.role).recentTripDetails;
    const [vehicles, drivers, trips, recentTrips] = await Promise.all([
        db.vehicle.groupBy({ by: ['status'], where: { organizationId: req.user.organizationId }, _count: true }), db.driver.groupBy({ by: ['status'], where: { organizationId: req.user.organizationId }, _count: true }), db.trip.groupBy({ by: ['status'], where: { organizationId: req.user.organizationId }, _count: true }),
        showRecentTrips ? db.trip.findMany({ where: { organizationId: req.user.organizationId }, take: 6, orderBy: { createdAt: 'desc' }, select: { id: true, tripNo: true, source: true, destination: true, status: true, vehicle: { select: { name: true } }, driver: { select: { name: true } } } }) : Promise.resolve([])
    ]);
    const vc = Object.fromEntries(vehicles.map(x => [x.status, x._count]));
    const dc = Object.fromEntries(drivers.map(x => [x.status, x._count]));
    const tc = Object.fromEntries(trips.map(x => [x.status, x._count]));
    const active = (vc.AVAILABLE || 0) + (vc.ON_TRIP || 0) + (vc.IN_SHOP || 0);
    const utilized = vc.ON_TRIP || 0;
    res.json({ kpis: { activeVehicles: active, availableVehicles: vc.AVAILABLE || 0, inMaintenance: vc.IN_SHOP || 0, activeTrips: tc.DISPATCHED || 0, pendingTrips: tc.DRAFT || 0, driversOnDuty: dc.ON_TRIP || 0, fleetUtilization: active ? Math.round(utilized / active * 100) : 0 }, vehicleStatus: vc, recentTrips });
}));
const vehicleSchema = zod_1.z.object({ registrationNo: zod_1.z.string().min(3), name: zod_1.z.string().min(2), type: zod_1.z.string().min(2), capacityKg: zod_1.z.coerce.number().positive(), requiredLicenseCategory: zod_1.z.enum(client_1.LicenseCategory), odometerKm: zod_1.z.coerce.number().nonnegative(), acquisitionCost: zod_1.z.coerce.number().nonnegative(), status: zod_1.z.enum(client_1.VehicleStatus).default(client_1.VehicleStatus.AVAILABLE), region: zod_1.z.string().default('Central') });
app.get('/api/vehicles', allow(client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => {
    const q = String(req.query.q || '');
    const status = req.query.status;
    const type = String(req.query.type || '');
    res.json(await db.vehicle.findMany({ where: { AND: [{ organizationId: req.user.organizationId }, q ? { OR: [{ registrationNo: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : {}, status ? { status } : {}, type ? { type } : {}] }, orderBy: { createdAt: 'desc' } }));
}));
app.get('/api/vehicles/available', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => res.json(await db.vehicle.findMany({ where: { organizationId: req.user.organizationId, status: client_1.VehicleStatus.AVAILABLE }, orderBy: { name: 'asc' } }))));
app.post('/api/vehicles', allow(client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => res.status(201).json(await db.vehicle.create({ data: { ...parse(vehicleSchema, req.body), organizationId: req.user.organizationId } }))));
app.put('/api/vehicles/:id', allow(client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { const row = await db.vehicle.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId } }); if (!row)
    throw Object.assign(new Error('Vehicle not found'), { status: 404 }); res.json(await db.vehicle.update({ where: { id: row.id }, data: parse(vehicleSchema.partial(), req.body) })); }));
app.delete('/api/vehicles/:id', allow(client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { const row = await db.vehicle.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId } }); if (!row)
    throw Object.assign(new Error('Vehicle not found'), { status: 404 }); await db.vehicle.delete({ where: { id: row.id } }); res.status(204).end(); }));
const driverSchema = zod_1.z.object({ name: zod_1.z.string().min(2), licenseNo: zod_1.z.string().min(3), licenseCategory: zod_1.z.enum(client_1.LicenseCategory), licenseExpiry: zod_1.z.coerce.date(), contact: zod_1.z.string().min(7), safetyScore: zod_1.z.coerce.number().int().min(0).max(100), status: zod_1.z.enum(client_1.DriverStatus).default(client_1.DriverStatus.AVAILABLE) });
app.get('/api/drivers', allow(client_1.Role.FLEET_MANAGER, client_1.Role.SAFETY_OFFICER), asyncRoute(async (req, res) => { const q = String(req.query.q || ''); res.json(await db.driver.findMany({ where: { organizationId: req.user.organizationId, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { licenseNo: { contains: q, mode: 'insensitive' } }] } : {}) }, orderBy: { createdAt: 'desc' } })); }));
app.get('/api/drivers/available', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => res.json(await db.driver.findMany({ where: { organizationId: req.user.organizationId, status: client_1.DriverStatus.AVAILABLE, licenseExpiry: { gt: new Date() } }, orderBy: { name: 'asc' } }))));
app.post('/api/drivers', allow(client_1.Role.FLEET_MANAGER, client_1.Role.SAFETY_OFFICER), asyncRoute(async (req, res) => res.status(201).json(await db.driver.create({ data: { ...parse(driverSchema, req.body), organizationId: req.user.organizationId } }))));
app.put('/api/drivers/:id', allow(client_1.Role.FLEET_MANAGER, client_1.Role.SAFETY_OFFICER), asyncRoute(async (req, res) => { const row = await db.driver.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId } }); if (!row)
    throw Object.assign(new Error('Driver not found'), { status: 404 }); res.json(await db.driver.update({ where: { id: row.id }, data: parse(driverSchema.partial(), req.body) })); }));
app.delete('/api/drivers/:id', allow(client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { const row = await db.driver.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId } }); if (!row)
    throw Object.assign(new Error('Driver not found'), { status: 404 }); await db.driver.delete({ where: { id: row.id } }); res.status(204).end(); }));
const tripSchema = zod_1.z.object({ source: zod_1.z.string().min(2), destination: zod_1.z.string().min(2), vehicleId: zod_1.z.string(), driverId: zod_1.z.string(), cargoWeightKg: zod_1.z.coerce.number().positive(), plannedDistanceKm: zod_1.z.coerce.number().positive(), revenue: zod_1.z.coerce.number().nonnegative().default(0), estimatedTollsInr: zod_1.z.union([zod_1.z.null(), zod_1.z.coerce.number().nonnegative()]).optional().default(null), estimatedDurationMin: zod_1.z.coerce.number().int().positive().optional(), routeSummary: zod_1.z.string().max(300).optional(), routeProvider: zod_1.z.enum(['GOOGLE', 'VALHALLA']).optional(), tollEstimateStatus: zod_1.z.enum(['ESTIMATED', 'HISTORICAL_ESTIMATE', 'NO_TOLLS_EXPECTED', 'TOLLS_PRESENT_PRICE_UNKNOWN', 'UNAVAILABLE']).optional(), routeEstimatedAt: zod_1.z.coerce.date().optional() });
app.get('/api/trips', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => res.json(await db.trip.findMany({ where: { organizationId: req.user.organizationId }, include: { vehicle: true, driver: true }, orderBy: { createdAt: 'desc' } }))));
const placeSchema = zod_1.z.object({ id: zod_1.z.string().min(1), name: zod_1.z.string().min(1), label: zod_1.z.string().min(1), city: zod_1.z.string().optional(), state: zod_1.z.string(), latitude: zod_1.z.number().finite().min(-90).max(90), longitude: zod_1.z.number().finite().min(-180).max(180), provider: zod_1.z.enum(['GOOGLE', 'PHOTON', 'BUILT_IN']) });
app.get('/api/places/search', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => res.json(await (0, routePlanning_1.searchPlaces)(String(req.query.q || '')))));
app.post('/api/routes/estimate', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => {
    const { source, destination, vehicleId } = parse(zod_1.z.object({ source: placeSchema, destination: placeSchema, vehicleId: zod_1.z.string().min(1) }), req.body);
    const organizationId = req.user.organizationId;
    const vehicle = await db.vehicle.findFirst({ where: { id: vehicleId, organizationId }, select: { id: true, type: true, capacityKg: true } });
    if (!vehicle)
        throw Object.assign(new Error('Vehicle not found'), { status: 404 });
    const routes = await (0, routePlanning_1.estimateRoutes)(source, destination);
    if (routes.options.some(option => option.estimatedToll === null)) {
        const [historyTrips, tollExpenses] = await Promise.all([
            db.trip.findMany({ where: { organizationId, status: { in: [client_1.TripStatus.COMPLETED, client_1.TripStatus.DISPATCHED] } }, select: { id: true, vehicleId: true, source: true, destination: true, plannedDistanceKm: true, createdAt: true, dispatchedAt: true, completedAt: true, estimatedTollsInr: true, vehicle: { select: { type: true, capacityKg: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }),
            db.expense.findMany({ where: { organizationId, type: 'TOLL' }, select: { vehicleId: true, amount: true, date: true }, orderBy: { date: 'desc' }, take: 250 })
        ]);
        const observations = (0, historicalTollEstimate_1.buildHistoricalTollObservations)(historyTrips.map(trip => ({ id: trip.id, vehicleId: trip.vehicleId, vehicleType: trip.vehicle.type, vehicleCapacityKg: trip.vehicle.capacityKg, source: trip.source, destination: trip.destination, distanceKm: trip.plannedDistanceKm, createdAt: trip.createdAt, dispatchedAt: trip.dispatchedAt, completedAt: trip.completedAt, providerEstimatedTollInr: trip.estimatedTollsInr })), tollExpenses.map(expense => ({ vehicleId: expense.vehicleId, amountInr: expense.amount, date: expense.date })));
        const vehicleClass = (0, historicalTollEstimate_1.resolveTollVehicleClass)(vehicle.type, vehicle.capacityKg);
        routes.options = routes.options.map(option => {
            if (option.estimatedToll !== null)
                return option;
            const estimate = (0, historicalTollEstimate_1.estimateHistoricalToll)({ source: source, destination: destination, distanceKm: option.distanceKm, vehicleClass, observations });
            return estimate ? { ...option, estimatedToll: estimate.estimatedTollInr, tollEstimateStatus: 'HISTORICAL_ESTIMATE', tollEstimateSource: estimate.source, tollConfidence: estimate.confidence, tollSampleSize: estimate.sampleSize, tollEstimatedAt: estimate.asOf } : option;
        });
    }
    res.json(routes);
}));
const profitabilityPreviewSchema = zod_1.z.object({ vehicleId: zod_1.z.string().min(1), plannedDistanceKm: zod_1.z.coerce.number().positive(), revenue: zod_1.z.coerce.number().nonnegative(), estimatedTollsInr: zod_1.z.union([zod_1.z.null(), zod_1.z.coerce.number().nonnegative()]).default(null) });
async function estimateTripProfitability(organizationId, data) {
    const vehicle = await db.vehicle.findFirst({ where: { id: data.vehicleId, organizationId }, select: { id: true, type: true, acquisitionCost: true } });
    if (!vehicle)
        throw Object.assign(new Error('Vehicle not found'), { status: 404 });
    const [maintenance, distance, recentFuelLogs, completedFuelTrips] = await Promise.all([
        db.maintenance.aggregate({ where: { organizationId, vehicleId: vehicle.id, status: client_1.MaintenanceStatus.CLOSED }, _sum: { cost: true } }),
        db.trip.aggregate({ where: { organizationId, vehicleId: vehicle.id, status: client_1.TripStatus.COMPLETED }, _sum: { plannedDistanceKm: true } }),
        db.fuelLog.findMany({ where: { organizationId, vehicleId: vehicle.id, liters: { gt: 0 }, cost: { gt: 0 } }, select: { liters: true, cost: true, date: true }, orderBy: { date: 'desc' }, take: 5 }),
        db.trip.findMany({ where: { organizationId, vehicleId: vehicle.id, status: client_1.TripStatus.COMPLETED, fuelConsumedL: { gt: 0 } }, select: { plannedDistanceKm: true, fuelConsumedL: true }, orderBy: { completedAt: 'desc' }, take: 10 })
    ]);
    const fuelPrediction = (0, tripProfitability_1.buildFuelPrediction)(recentFuelLogs, completedFuelTrips.map(trip => ({ distanceKm: trip.plannedDistanceKm, fuelConsumedL: trip.fuelConsumedL })));
    return (0, tripProfitability_1.calculateTripProfitability)({
        revenueInr: data.revenue,
        plannedDistanceKm: data.plannedDistanceKm,
        estimatedTollsInr: data.estimatedTollsInr,
        vehicleType: vehicle.type,
        vehicleAcquisitionCostInr: vehicle.acquisitionCost,
        historicalMaintenanceCostInr: maintenance._sum.cost || 0,
        historicalCompletedDistanceKm: distance._sum.plannedDistanceKm || 0,
        fuelPrediction,
        config: tripProfitabilityConfig
    });
}
app.post('/api/trips/profitability-estimate', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => {
    const data = parse(profitabilityPreviewSchema, req.body);
    res.json(await estimateTripProfitability(req.user.organizationId, data));
}));
app.get('/api/trips/:id/profitability-estimate', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => {
    const trip = await db.trip.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId } });
    if (!trip)
        throw Object.assign(new Error('Trip not found'), { status: 404 });
    if (trip.status !== client_1.TripStatus.DRAFT)
        throw Object.assign(new Error('Profitability is reviewed before a draft is dispatched'), { status: 409 });
    res.json(await estimateTripProfitability(req.user.organizationId, { vehicleId: trip.vehicleId, plannedDistanceKm: trip.plannedDistanceKm, revenue: trip.revenue, estimatedTollsInr: trip.estimatedTollsInr }));
}));
async function getAssignmentContext(organizationId, vehicleId, driverId) {
    const [vehicle, driver, vehicleTrip, driverTrip, maintenance] = await Promise.all([
        db.vehicle.findFirst({ where: { id: vehicleId, organizationId } }),
        db.driver.findFirst({ where: { id: driverId, organizationId } }),
        db.trip.findFirst({ where: { organizationId, vehicleId, status: client_1.TripStatus.DISPATCHED }, select: { tripNo: true } }),
        db.trip.findFirst({ where: { organizationId, driverId, status: client_1.TripStatus.DISPATCHED }, select: { tripNo: true } }),
        db.maintenance.findFirst({ where: { organizationId, vehicleId, status: client_1.MaintenanceStatus.ACTIVE }, select: { serviceType: true } })
    ]);
    return { vehicle, driver, vehicleTripNo: vehicleTrip?.tripNo, driverTripNo: driverTrip?.tripNo, maintenanceService: maintenance?.serviceType };
}
app.post('/api/trips/validate-assignment', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => {
    const data = parse(tripSchema.pick({ vehicleId: true, driverId: true, cargoWeightKg: true }), req.body);
    const context = await getAssignmentContext(req.user.organizationId, data.vehicleId, data.driverId);
    try {
        (0, assignmentEligibility_1.assertAssignmentEligible)({ ...context, cargoWeightKg: data.cargoWeightKg });
        res.json({ eligible: true, reasons: [] });
    }
    catch (error) {
        if (error instanceof assignmentEligibility_1.AssignmentEligibilityError)
            return res.json({ eligible: false, reasons: error.reasons });
        throw error;
    }
}));
app.post('/api/trips', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => {
    const data = parse(tripSchema, req.body);
    const context = await getAssignmentContext(req.user.organizationId, data.vehicleId, data.driverId);
    (0, assignmentEligibility_1.assertAssignmentEligible)({ ...context, cargoWeightKg: data.cargoWeightKg });
    const tripNo = `TRP${String((await db.trip.count({ where: { organizationId: req.user.organizationId } })) + 1).padStart(4, '0')}`;
    res.status(201).json(await db.trip.create({ data: { ...data, tripNo, organizationId: req.user.organizationId }, include: { vehicle: true, driver: true } }));
}));
app.post('/api/trips/:id/dispatch', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => {
    const trip = await db.trip.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId } });
    if (!trip)
        throw Object.assign(new Error('Trip not found'), { status: 404 });
    const context = await getAssignmentContext(req.user.organizationId, trip.vehicleId, trip.driverId);
    (0, assignmentEligibility_1.assertAssignmentEligible)({ ...context, cargoWeightKg: trip.cargoWeightKg, tripStatus: trip.status });
    const result = await db.$transaction(async (tx) => {
        const vehicle = await tx.vehicle.updateMany({ where: { id: trip.vehicleId, organizationId: req.user.organizationId, status: client_1.VehicleStatus.AVAILABLE }, data: { status: client_1.VehicleStatus.ON_TRIP } });
        const driver = await tx.driver.updateMany({ where: { id: trip.driverId, organizationId: req.user.organizationId, status: client_1.DriverStatus.AVAILABLE, licenseExpiry: { gt: new Date() } }, data: { status: client_1.DriverStatus.ON_TRIP } });
        if (vehicle.count !== 1 || driver.count !== 1)
            throw new assignmentEligibility_1.AssignmentEligibilityError([{ code: vehicle.count !== 1 ? 'VEHICLE_ON_TRIP' : 'DRIVER_ON_TRIP', field: vehicle.count !== 1 ? 'vehicleId' : 'driverId', message: 'Assignment availability changed while dispatching. Review the latest vehicle and driver status, then try again.' }]);
        return tx.trip.update({ where: { id: trip.id }, data: { status: client_1.TripStatus.DISPATCHED, dispatchedAt: new Date() }, include: { vehicle: true, driver: true } });
    }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
    res.json(result);
}));
app.post('/api/trips/:id/complete', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => {
    const { finalOdometerKm, fuelConsumedL } = parse(zod_1.z.object({ finalOdometerKm: zod_1.z.coerce.number().positive(), fuelConsumedL: zod_1.z.coerce.number().positive() }), req.body);
    const trip = await db.trip.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId } });
    if (!trip || trip.status !== client_1.TripStatus.DISPATCHED)
        throw Object.assign(new Error('Only dispatched trips can be completed'), { status: 409 });
    const result = await db.$transaction(async (tx) => { await tx.vehicle.update({ where: { id: trip.vehicleId }, data: { status: client_1.VehicleStatus.AVAILABLE, odometerKm: finalOdometerKm } }); await tx.driver.update({ where: { id: trip.driverId }, data: { status: client_1.DriverStatus.AVAILABLE } }); return tx.trip.update({ where: { id: trip.id }, data: { status: client_1.TripStatus.COMPLETED, completedAt: new Date(), finalOdometerKm, fuelConsumedL }, include: { vehicle: true, driver: true } }); });
    res.json(result);
}));
app.post('/api/trips/:id/cancel', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { const trip = await db.trip.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId } }); if (!trip || (trip.status !== client_1.TripStatus.DRAFT && trip.status !== client_1.TripStatus.DISPATCHED))
    throw Object.assign(new Error('Trip cannot be cancelled'), { status: 409 }); const wasLive = trip.status === client_1.TripStatus.DISPATCHED; const result = await db.$transaction(async (tx) => { if (wasLive) {
    await tx.vehicle.update({ where: { id: trip.vehicleId }, data: { status: client_1.VehicleStatus.AVAILABLE } });
    await tx.driver.update({ where: { id: trip.driverId }, data: { status: client_1.DriverStatus.AVAILABLE } });
} return tx.trip.update({ where: { id: trip.id }, data: { status: client_1.TripStatus.CANCELLED }, include: { vehicle: true, driver: true } }); }); res.json(result); }));
const maintenanceSchema = zod_1.z.object({ vehicleId: zod_1.z.string(), serviceType: zod_1.z.string().min(2), description: zod_1.z.string().optional(), cost: zod_1.z.coerce.number().nonnegative() });
app.get('/api/maintenance', allow(client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => res.json(await db.maintenance.findMany({ where: { organizationId: req.user.organizationId }, include: { vehicle: true }, orderBy: { startDate: 'desc' } }))));
app.post('/api/maintenance', allow(client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { const data = parse(maintenanceSchema, req.body); const v = await db.vehicle.findFirst({ where: { id: data.vehicleId, organizationId: req.user.organizationId } }); if (!v || v.status !== client_1.VehicleStatus.AVAILABLE)
    throw Object.assign(new Error('Only available vehicles can enter maintenance'), { status: 409 }); const result = await db.$transaction(async (tx) => { await tx.vehicle.update({ where: { id: v.id }, data: { status: client_1.VehicleStatus.IN_SHOP } }); return tx.maintenance.create({ data: { ...data, organizationId: req.user.organizationId }, include: { vehicle: true } }); }); res.status(201).json(result); }));
app.post('/api/maintenance/:id/close', allow(client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { const m = await db.maintenance.findFirst({ where: { id: idParam(req), organizationId: req.user.organizationId }, include: { vehicle: true } }); if (!m || m.status !== client_1.MaintenanceStatus.ACTIVE)
    throw Object.assign(new Error('Active maintenance record not found'), { status: 404 }); const result = await db.$transaction(async (tx) => { if (m.vehicle.status !== client_1.VehicleStatus.RETIRED)
    await tx.vehicle.update({ where: { id: m.vehicleId }, data: { status: client_1.VehicleStatus.AVAILABLE } }); return tx.maintenance.update({ where: { id: m.id }, data: { status: client_1.MaintenanceStatus.CLOSED, endDate: new Date() }, include: { vehicle: true } }); }); res.json(result); }));
app.get('/api/finance', allow(client_1.Role.FINANCIAL_ANALYST, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { const where = { organizationId: req.user.organizationId }; const [fuelLogs, expenses] = await Promise.all([db.fuelLog.findMany({ where, include: { vehicle: true }, orderBy: { date: 'desc' } }), db.expense.findMany({ where, include: { vehicle: true }, orderBy: { date: 'desc' } })]); res.json({ fuelLogs, expenses }); }));
app.post('/api/fuel', allow(client_1.Role.FINANCIAL_ANALYST, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { const data = parse(zod_1.z.object({ vehicleId: zod_1.z.string(), liters: zod_1.z.coerce.number().positive(), cost: zod_1.z.coerce.number().positive(), date: zod_1.z.coerce.date().optional(), odometerKm: zod_1.z.coerce.number().positive().optional() }), req.body); const vehicle = await db.vehicle.findFirst({ where: { id: data.vehicleId, organizationId: req.user.organizationId } }); if (!vehicle)
    throw Object.assign(new Error('Vehicle not found'), { status: 404 }); res.status(201).json(await db.fuelLog.create({ data: { ...data, organizationId: req.user.organizationId }, include: { vehicle: true } })); }));
app.post('/api/expenses', allow(client_1.Role.FINANCIAL_ANALYST, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { const data = parse(zod_1.z.object({ vehicleId: zod_1.z.string(), type: zod_1.z.enum(['TOLL', 'REPAIR', 'INSURANCE', 'OTHER']), description: zod_1.z.string().optional(), amount: zod_1.z.coerce.number().positive(), date: zod_1.z.coerce.date().optional() }), req.body); const vehicle = await db.vehicle.findFirst({ where: { id: data.vehicleId, organizationId: req.user.organizationId } }); if (!vehicle)
    throw Object.assign(new Error('Vehicle not found'), { status: 404 }); res.status(201).json(await db.expense.create({ data: { ...data, organizationId: req.user.organizationId }, include: { vehicle: true } })); }));
async function analytics(organizationId) {
    const where = { organizationId };
    const [vehicles, fuel, maintenance, expenses, trips] = await Promise.all([db.vehicle.findMany({ where }), db.fuelLog.findMany({ where }), db.maintenance.findMany({ where }), db.expense.findMany({ where }), db.trip.findMany({ where })]);
    const totalFuel = fuel.reduce((s, x) => s + x.cost, 0), totalMaintenance = maintenance.reduce((s, x) => s + x.cost, 0), totalOther = expenses.reduce((s, x) => s + x.amount, 0), liters = fuel.reduce((s, x) => s + x.liters, 0), distance = trips.filter(x => x.status === client_1.TripStatus.COMPLETED).reduce((s, x) => s + x.plannedDistanceKm, 0), revenue = trips.reduce((s, x) => s + x.revenue, 0), acquisition = vehicles.reduce((s, x) => s + x.acquisitionCost, 0), active = vehicles.filter(x => x.status !== client_1.VehicleStatus.RETIRED).length;
    const byVehicle = vehicles.map(v => { const vf = fuel.filter(x => x.vehicleId === v.id).reduce((s, x) => s + x.cost, 0), vm = maintenance.filter(x => x.vehicleId === v.id).reduce((s, x) => s + x.cost, 0), ve = expenses.filter(x => x.vehicleId === v.id).reduce((s, x) => s + x.amount, 0), vr = trips.filter(x => x.vehicleId === v.id).reduce((s, x) => s + x.revenue, 0); return { id: v.id, name: v.name, registrationNo: v.registrationNo, operationalCost: vf + vm + ve, roi: v.acquisitionCost ? ((vr - vf - vm) / v.acquisitionCost) * 100 : 0 }; });
    return { summary: { fuelEfficiency: liters ? distance / liters : 0, fleetUtilization: active ? vehicles.filter(x => x.status === client_1.VehicleStatus.ON_TRIP).length / active * 100 : 0, operationalCost: totalFuel + totalMaintenance + totalOther, vehicleRoi: acquisition ? (revenue - totalFuel - totalMaintenance) / acquisition * 100 : 0 }, byVehicle };
}
const allowFinancialAnalytics = (req, res, next) => (0, security_1.disclosurePolicyForRole)(req.user.role).financialAnalytics ? next() : res.status(403).json({ message: 'You do not have permission to view financial analytics' });
app.get('/api/analytics', allowFinancialAnalytics, asyncRoute(async (req, res) => res.json(await analytics(req.user.organizationId))));
app.get('/api/analytics/export.csv', allowFinancialAnalytics, asyncRoute(async (req, res) => { const a = await analytics(req.user.organizationId); const csv = ['Vehicle,Registration,Operational Cost,ROI %', ...a.byVehicle.map(x => `"${x.name}","${x.registrationNo}",${x.operationalCost.toFixed(2)},${x.roi.toFixed(2)}`)].join('\n'); res.type('text/csv').attachment('fleetpilot-analytics.csv').send(csv); }));
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
process.on('SIGTERM', async () => { await db.$disconnect(); process.exit(0); });
