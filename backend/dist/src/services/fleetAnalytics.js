"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateFleetAnalytics = calculateFleetAnalytics;
const sum = (rows, value) => rows.reduce((total, row) => total + value(row), 0);
const round = (value, digits = 2) => Number(value.toFixed(digits));
const monthKey = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
const monthLabel = (date) => new Intl.DateTimeFormat('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(date);
function calculateFleetAnalytics({ vehicles, fuel, maintenance, expenses, trips, now = new Date() }) {
    const completed = trips.filter(trip => trip.status === 'COMPLETED');
    const totalFuel = sum(fuel, row => row.cost), totalMaintenance = sum(maintenance, row => row.cost), totalExpenses = sum(expenses, row => row.amount);
    const totalCost = totalFuel + totalMaintenance + totalExpenses, totalRevenue = sum(completed, row => row.revenue), totalDistance = sum(completed, row => row.plannedDistanceKm);
    const consumedLitres = sum(completed.filter(row => (row.fuelConsumedL || 0) > 0), row => row.fuelConsumedL || 0);
    const purchasedLitres = sum(fuel, row => row.liters), activeVehicles = vehicles.filter(row => row.status !== 'RETIRED'), onTrip = vehicles.filter(row => row.status === 'ON_TRIP').length;
    const acquisition = sum(vehicles, row => row.acquisitionCost), profit = totalRevenue - totalCost;
    const expenseByType = (type) => sum(expenses.filter(row => row.type === type), row => row.amount);
    const tollCost = expenseByType('TOLL'), driverCost = expenseByType('DRIVER_PAYMENT'), otherExpenseCost = totalExpenses - tollCost - driverCost;
    const byVehicle = vehicles.map(vehicle => {
        const vehicleFuel = fuel.filter(row => row.vehicleId === vehicle.id), vehicleMaintenance = maintenance.filter(row => row.vehicleId === vehicle.id), vehicleExpenses = expenses.filter(row => row.vehicleId === vehicle.id), vehicleTrips = trips.filter(row => row.vehicleId === vehicle.id), vehicleCompleted = vehicleTrips.filter(row => row.status === 'COMPLETED');
        const fuelCost = sum(vehicleFuel, row => row.cost), maintenanceCost = sum(vehicleMaintenance, row => row.cost), expenseCost = sum(vehicleExpenses, row => row.amount), operationalCost = fuelCost + maintenanceCost + expenseCost, revenue = sum(vehicleCompleted, row => row.revenue), distanceKm = sum(vehicleCompleted, row => row.plannedDistanceKm), vehicleProfit = revenue - operationalCost;
        return { id: vehicle.id, name: vehicle.name, registrationNo: vehicle.registrationNo, type: vehicle.type, region: vehicle.region, status: vehicle.status, completedTrips: vehicleCompleted.length, totalTrips: vehicleTrips.length, distanceKm: round(distanceKm), revenue: round(revenue), fuelCost: round(fuelCost), maintenanceCost: round(maintenanceCost), expenseCost: round(expenseCost), operationalCost: round(operationalCost), profit: round(vehicleProfit), marginPercent: revenue ? round(vehicleProfit / revenue * 100, 1) : null, costPerKm: distanceKm ? round(operationalCost / distanceKm) : null, roi: vehicle.acquisitionCost ? round(vehicleProfit / vehicle.acquisitionCost * 100, 1) : null };
    }).sort((a, b) => b.operationalCost - a.operationalCost);
    const months = Array.from({ length: 6 }, (_, index) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1)));
    const monthlyTrend = months.map(month => {
        const key = monthKey(month), monthFuel = fuel.filter(row => monthKey(row.date) === key), monthMaintenance = maintenance.filter(row => monthKey(row.startDate) === key), monthExpenses = expenses.filter(row => monthKey(row.date) === key), monthTrips = completed.filter(row => row.completedAt && monthKey(row.completedAt) === key);
        const cost = sum(monthFuel, row => row.cost) + sum(monthMaintenance, row => row.cost) + sum(monthExpenses, row => row.amount), revenue = sum(monthTrips, row => row.revenue);
        return { month: key, label: monthLabel(month), revenue: round(revenue), cost: round(cost), profit: round(revenue - cost), completedTrips: monthTrips.length };
    });
    const statusOrder = ['AVAILABLE', 'ON_TRIP', 'IN_SHOP', 'RETIRED'];
    const statusDistribution = statusOrder.map(status => ({ status, count: vehicles.filter(vehicle => vehicle.status === status).length }));
    return {
        generatedAt: now.toISOString(),
        summary: { fuelEfficiency: round(consumedLitres ? totalDistance / consumedLitres : purchasedLitres ? totalDistance / purchasedLitres : 0, 1), fleetUtilization: round(activeVehicles.length ? onTrip / activeVehicles.length * 100 : 0, 1), operationalCost: round(totalCost), vehicleRoi: round(acquisition ? profit / acquisition * 100 : 0, 1), realizedRevenue: round(totalRevenue), realizedProfit: round(profit), profitMargin: totalRevenue ? round(profit / totalRevenue * 100, 1) : null, costPerKm: totalDistance ? round(totalCost / totalDistance) : null, completedTrips: completed.length, totalDistanceKm: round(totalDistance), activeVehicles: activeVehicles.length },
        costBreakdown: { fuel: round(totalFuel), maintenance: round(totalMaintenance), tolls: round(tollCost), driverPayments: round(driverCost), otherExpenses: round(otherExpenseCost) },
        statusDistribution, monthlyTrend, byVehicle,
    };
}
