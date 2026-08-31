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
const db = new client_1.PrismaClient();
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT || 4000);
const SECRET = process.env.JWT_SECRET || 'development-only-change-me';
app.use((0, cors_1.default)({ origin: process.env.FRONTEND_URL?.split(',') || ['http://localhost:5173'], credentials: true }));
app.use(express_1.default.json());
const asyncRoute = (fn) => (req, res, next) => { Promise.resolve(fn(req, res, next)).catch(next); };
const authenticate = asyncRoute(async (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/, '');
    if (!token)
        return res.status(401).json({ message: 'Authentication required' });
    try {
        req.user = jsonwebtoken_1.default.verify(token, SECRET);
        next();
    }
    catch {
        res.status(401).json({ message: 'Session expired. Please sign in again.' });
    }
});
const allow = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ message: 'You do not have permission for this action' });
const parse = (schema, data) => { const out = schema.safeParse(data); if (!out.success)
    throw Object.assign(new Error(out.error.issues[0]?.message || 'Invalid request'), { status: 400 }); return out.data; };
const idParam = (req) => String(req.params.id);
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'TransitOps API' }));
app.post('/api/auth/login', asyncRoute(async (req, res) => {
    const { email, password, role } = parse(zod_1.z.object({ email: zod_1.z.email(), password: zod_1.z.string().min(6), role: zod_1.z.enum(client_1.Role).optional() }), req.body);
    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !(await bcryptjs_1.default.compare(password, user.passwordHash)) || (role && role !== user.role))
        return res.status(401).json({ message: 'Invalid credentials or role' });
    const session = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.json({ token: jsonwebtoken_1.default.sign(session, SECRET, { expiresIn: '8h' }), user: session });
}));
app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: req.user }));
app.use('/api', authenticate);
app.get('/api/dashboard', asyncRoute(async (req, res) => {
    const [vehicles, drivers, trips, recentTrips] = await Promise.all([
        db.vehicle.groupBy({ by: ['status'], _count: true }), db.driver.groupBy({ by: ['status'], _count: true }), db.trip.groupBy({ by: ['status'], _count: true }),
        db.trip.findMany({ take: 6, orderBy: { createdAt: 'desc' }, include: { vehicle: true, driver: true } })
    ]);
    const vc = Object.fromEntries(vehicles.map(x => [x.status, x._count]));
    const dc = Object.fromEntries(drivers.map(x => [x.status, x._count]));
    const tc = Object.fromEntries(trips.map(x => [x.status, x._count]));
    const active = (vc.AVAILABLE || 0) + (vc.ON_TRIP || 0) + (vc.IN_SHOP || 0);
    const utilized = vc.ON_TRIP || 0;
    res.json({ kpis: { activeVehicles: active, availableVehicles: vc.AVAILABLE || 0, inMaintenance: vc.IN_SHOP || 0, activeTrips: tc.DISPATCHED || 0, pendingTrips: tc.DRAFT || 0, driversOnDuty: dc.ON_TRIP || 0, fleetUtilization: active ? Math.round(utilized / active * 100) : 0 }, vehicleStatus: vc, recentTrips });
}));
const vehicleSchema = zod_1.z.object({ registrationNo: zod_1.z.string().min(3), name: zod_1.z.string().min(2), type: zod_1.z.string().min(2), capacityKg: zod_1.z.coerce.number().positive(), odometerKm: zod_1.z.coerce.number().nonnegative(), acquisitionCost: zod_1.z.coerce.number().nonnegative(), status: zod_1.z.enum(client_1.VehicleStatus).default(client_1.VehicleStatus.AVAILABLE), region: zod_1.z.string().default('Central') });
app.get('/api/vehicles', asyncRoute(async (req, res) => {
    const q = String(req.query.q || '');
    const status = req.query.status;
    const type = String(req.query.type || '');
    res.json(await db.vehicle.findMany({ where: { AND: [q ? { OR: [{ registrationNo: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : {}, status ? { status } : {}, type ? { type } : {}] }, orderBy: { createdAt: 'desc' } }));
}));
app.get('/api/vehicles/available', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (_req, res) => res.json(await db.vehicle.findMany({ where: { status: client_1.VehicleStatus.AVAILABLE }, orderBy: { name: 'asc' } }))));
app.post('/api/vehicles', allow(client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => res.status(201).json(await db.vehicle.create({ data: parse(vehicleSchema, req.body) }))));
app.put('/api/vehicles/:id', allow(client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => res.json(await db.vehicle.update({ where: { id: idParam(req) }, data: parse(vehicleSchema.partial(), req.body) }))));
app.delete('/api/vehicles/:id', allow(client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { await db.vehicle.delete({ where: { id: idParam(req) } }); res.status(204).end(); }));
const driverSchema = zod_1.z.object({ name: zod_1.z.string().min(2), licenseNo: zod_1.z.string().min(3), licenseCategory: zod_1.z.string().min(2), licenseExpiry: zod_1.z.coerce.date(), contact: zod_1.z.string().min(7), safetyScore: zod_1.z.coerce.number().int().min(0).max(100), status: zod_1.z.enum(client_1.DriverStatus).default(client_1.DriverStatus.AVAILABLE) });
app.get('/api/drivers', asyncRoute(async (req, res) => { const q = String(req.query.q || ''); res.json(await db.driver.findMany({ where: q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { licenseNo: { contains: q, mode: 'insensitive' } }] } : {}, orderBy: { createdAt: 'desc' } })); }));
app.get('/api/drivers/available', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (_req, res) => res.json(await db.driver.findMany({ where: { status: client_1.DriverStatus.AVAILABLE, licenseExpiry: { gt: new Date() } }, orderBy: { name: 'asc' } }))));
app.post('/api/drivers', allow(client_1.Role.FLEET_MANAGER, client_1.Role.SAFETY_OFFICER), asyncRoute(async (req, res) => res.status(201).json(await db.driver.create({ data: parse(driverSchema, req.body) }))));
app.put('/api/drivers/:id', allow(client_1.Role.FLEET_MANAGER, client_1.Role.SAFETY_OFFICER), asyncRoute(async (req, res) => res.json(await db.driver.update({ where: { id: idParam(req) }, data: parse(driverSchema.partial(), req.body) }))));
app.delete('/api/drivers/:id', allow(client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { await db.driver.delete({ where: { id: idParam(req) } }); res.status(204).end(); }));
const tripSchema = zod_1.z.object({ source: zod_1.z.string().min(2), destination: zod_1.z.string().min(2), vehicleId: zod_1.z.string(), driverId: zod_1.z.string(), cargoWeightKg: zod_1.z.coerce.number().positive(), plannedDistanceKm: zod_1.z.coerce.number().positive(), revenue: zod_1.z.coerce.number().nonnegative().default(0) });
app.get('/api/trips', asyncRoute(async (_req, res) => res.json(await db.trip.findMany({ include: { vehicle: true, driver: true }, orderBy: { createdAt: 'desc' } }))));
app.post('/api/trips', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => {
    const data = parse(tripSchema, req.body);
    const [v, d] = await Promise.all([db.vehicle.findUnique({ where: { id: data.vehicleId } }), db.driver.findUnique({ where: { id: data.driverId } })]);
    if (!v || !d)
        throw Object.assign(new Error('Vehicle or driver not found'), { status: 404 });
    if (v.status !== client_1.VehicleStatus.AVAILABLE)
        throw Object.assign(new Error('Selected vehicle is not available'), { status: 409 });
    if (d.status !== client_1.DriverStatus.AVAILABLE || d.licenseExpiry <= new Date())
        throw Object.assign(new Error('Driver is unavailable, suspended, or license has expired'), { status: 409 });
    if (data.cargoWeightKg > v.capacityKg)
        throw Object.assign(new Error(`Cargo exceeds ${v.capacityKg} kg vehicle capacity`), { status: 400 });
    const tripNo = `TRP${String((await db.trip.count()) + 1).padStart(4, '0')}`;
    res.status(201).json(await db.trip.create({ data: { ...data, tripNo }, include: { vehicle: true, driver: true } }));
}));
app.post('/api/trips/:id/dispatch', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => {
    const trip = await db.trip.findUnique({ where: { id: idParam(req) }, include: { vehicle: true, driver: true } });
    if (!trip)
        throw Object.assign(new Error('Trip not found'), { status: 404 });
    if (trip.status !== client_1.TripStatus.DRAFT)
        throw Object.assign(new Error('Only draft trips can be dispatched'), { status: 409 });
    if (trip.vehicle.status !== client_1.VehicleStatus.AVAILABLE || trip.driver.status !== client_1.DriverStatus.AVAILABLE || trip.driver.licenseExpiry <= new Date())
        throw Object.assign(new Error('Vehicle or driver is no longer eligible'), { status: 409 });
    const result = await db.$transaction(async (tx) => { await tx.vehicle.update({ where: { id: trip.vehicleId }, data: { status: client_1.VehicleStatus.ON_TRIP } }); await tx.driver.update({ where: { id: trip.driverId }, data: { status: client_1.DriverStatus.ON_TRIP } }); return tx.trip.update({ where: { id: trip.id }, data: { status: client_1.TripStatus.DISPATCHED, dispatchedAt: new Date() }, include: { vehicle: true, driver: true } }); });
    res.json(result);
}));
app.post('/api/trips/:id/complete', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => {
    const { finalOdometerKm, fuelConsumedL } = parse(zod_1.z.object({ finalOdometerKm: zod_1.z.coerce.number().positive(), fuelConsumedL: zod_1.z.coerce.number().positive() }), req.body);
    const trip = await db.trip.findUnique({ where: { id: idParam(req) } });
    if (!trip || trip.status !== client_1.TripStatus.DISPATCHED)
        throw Object.assign(new Error('Only dispatched trips can be completed'), { status: 409 });
    const result = await db.$transaction(async (tx) => { await tx.vehicle.update({ where: { id: trip.vehicleId }, data: { status: client_1.VehicleStatus.AVAILABLE, odometerKm: finalOdometerKm } }); await tx.driver.update({ where: { id: trip.driverId }, data: { status: client_1.DriverStatus.AVAILABLE } }); return tx.trip.update({ where: { id: trip.id }, data: { status: client_1.TripStatus.COMPLETED, completedAt: new Date(), finalOdometerKm, fuelConsumedL }, include: { vehicle: true, driver: true } }); });
    res.json(result);
}));
app.post('/api/trips/:id/cancel', allow(client_1.Role.DISPATCHER, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { const trip = await db.trip.findUnique({ where: { id: idParam(req) } }); if (!trip || (trip.status !== client_1.TripStatus.DRAFT && trip.status !== client_1.TripStatus.DISPATCHED))
    throw Object.assign(new Error('Trip cannot be cancelled'), { status: 409 }); const wasLive = trip.status === client_1.TripStatus.DISPATCHED; const result = await db.$transaction(async (tx) => { if (wasLive) {
    await tx.vehicle.update({ where: { id: trip.vehicleId }, data: { status: client_1.VehicleStatus.AVAILABLE } });
    await tx.driver.update({ where: { id: trip.driverId }, data: { status: client_1.DriverStatus.AVAILABLE } });
} return tx.trip.update({ where: { id: trip.id }, data: { status: client_1.TripStatus.CANCELLED }, include: { vehicle: true, driver: true } }); }); res.json(result); }));
const maintenanceSchema = zod_1.z.object({ vehicleId: zod_1.z.string(), serviceType: zod_1.z.string().min(2), description: zod_1.z.string().optional(), cost: zod_1.z.coerce.number().nonnegative() });
app.get('/api/maintenance', asyncRoute(async (_req, res) => res.json(await db.maintenance.findMany({ include: { vehicle: true }, orderBy: { startDate: 'desc' } }))));
app.post('/api/maintenance', allow(client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { const data = parse(maintenanceSchema, req.body); const v = await db.vehicle.findUnique({ where: { id: data.vehicleId } }); if (!v || v.status !== client_1.VehicleStatus.AVAILABLE)
    throw Object.assign(new Error('Only available vehicles can enter maintenance'), { status: 409 }); const result = await db.$transaction(async (tx) => { await tx.vehicle.update({ where: { id: v.id }, data: { status: client_1.VehicleStatus.IN_SHOP } }); return tx.maintenance.create({ data, include: { vehicle: true } }); }); res.status(201).json(result); }));
app.post('/api/maintenance/:id/close', allow(client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { const m = await db.maintenance.findUnique({ where: { id: idParam(req) }, include: { vehicle: true } }); if (!m || m.status !== client_1.MaintenanceStatus.ACTIVE)
    throw Object.assign(new Error('Active maintenance record not found'), { status: 404 }); const result = await db.$transaction(async (tx) => { if (m.vehicle.status !== client_1.VehicleStatus.RETIRED)
    await tx.vehicle.update({ where: { id: m.vehicleId }, data: { status: client_1.VehicleStatus.AVAILABLE } }); return tx.maintenance.update({ where: { id: m.id }, data: { status: client_1.MaintenanceStatus.CLOSED, endDate: new Date() }, include: { vehicle: true } }); }); res.json(result); }));
app.get('/api/finance', asyncRoute(async (_req, res) => { const [fuelLogs, expenses] = await Promise.all([db.fuelLog.findMany({ include: { vehicle: true }, orderBy: { date: 'desc' } }), db.expense.findMany({ include: { vehicle: true }, orderBy: { date: 'desc' } })]); res.json({ fuelLogs, expenses }); }));
app.post('/api/fuel', allow(client_1.Role.FINANCIAL_ANALYST, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { const data = parse(zod_1.z.object({ vehicleId: zod_1.z.string(), liters: zod_1.z.coerce.number().positive(), cost: zod_1.z.coerce.number().positive(), date: zod_1.z.coerce.date().optional(), odometerKm: zod_1.z.coerce.number().positive().optional() }), req.body); res.status(201).json(await db.fuelLog.create({ data, include: { vehicle: true } })); }));
app.post('/api/expenses', allow(client_1.Role.FINANCIAL_ANALYST, client_1.Role.FLEET_MANAGER), asyncRoute(async (req, res) => { const data = parse(zod_1.z.object({ vehicleId: zod_1.z.string(), type: zod_1.z.enum(['TOLL', 'REPAIR', 'INSURANCE', 'OTHER']), description: zod_1.z.string().optional(), amount: zod_1.z.coerce.number().positive(), date: zod_1.z.coerce.date().optional() }), req.body); res.status(201).json(await db.expense.create({ data, include: { vehicle: true } })); }));
async function analytics() {
    const [vehicles, fuel, maintenance, expenses, trips] = await Promise.all([db.vehicle.findMany(), db.fuelLog.findMany(), db.maintenance.findMany(), db.expense.findMany(), db.trip.findMany()]);
    const totalFuel = fuel.reduce((s, x) => s + x.cost, 0), totalMaintenance = maintenance.reduce((s, x) => s + x.cost, 0), totalOther = expenses.reduce((s, x) => s + x.amount, 0), liters = fuel.reduce((s, x) => s + x.liters, 0), distance = trips.filter(x => x.status === client_1.TripStatus.COMPLETED).reduce((s, x) => s + x.plannedDistanceKm, 0), revenue = trips.reduce((s, x) => s + x.revenue, 0), acquisition = vehicles.reduce((s, x) => s + x.acquisitionCost, 0), active = vehicles.filter(x => x.status !== client_1.VehicleStatus.RETIRED).length;
    const byVehicle = vehicles.map(v => { const vf = fuel.filter(x => x.vehicleId === v.id).reduce((s, x) => s + x.cost, 0), vm = maintenance.filter(x => x.vehicleId === v.id).reduce((s, x) => s + x.cost, 0), ve = expenses.filter(x => x.vehicleId === v.id).reduce((s, x) => s + x.amount, 0), vr = trips.filter(x => x.vehicleId === v.id).reduce((s, x) => s + x.revenue, 0); return { id: v.id, name: v.name, registrationNo: v.registrationNo, operationalCost: vf + vm + ve, roi: v.acquisitionCost ? ((vr - vf - vm) / v.acquisitionCost) * 100 : 0 }; });
    return { summary: { fuelEfficiency: liters ? distance / liters : 0, fleetUtilization: active ? vehicles.filter(x => x.status === client_1.VehicleStatus.ON_TRIP).length / active * 100 : 0, operationalCost: totalFuel + totalMaintenance + totalOther, vehicleRoi: acquisition ? (revenue - totalFuel - totalMaintenance) / acquisition * 100 : 0 }, byVehicle };
}
app.get('/api/analytics', asyncRoute(async (_req, res) => res.json(await analytics())));
app.get('/api/analytics/export.csv', asyncRoute(async (_req, res) => { const a = await analytics(); const csv = ['Vehicle,Registration,Operational Cost,ROI %', ...a.byVehicle.map(x => `"${x.name}","${x.registrationNo}",${x.operationalCost.toFixed(2)},${x.roi.toFixed(2)}`)].join('\n'); res.type('text/csv').attachment('transitops-analytics.csv').send(csv); }));
app.use((err, _req, res, _next) => { console.error(err); if (err instanceof client_1.Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
    return res.status(409).json({ message: 'A record with this unique value already exists' }); res.status(err.status || 500).json({ message: err.message || 'Internal server error' }); });
app.listen(PORT, () => console.log(`TransitOps API running at http://localhost:${PORT}`));
process.on('SIGTERM', async () => { await db.$disconnect(); process.exit(0); });
