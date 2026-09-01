"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.disclosurePolicyForRole = disclosurePolicyForRole;
exports.vehicleForCopilot = vehicleForCopilot;
exports.driverForCopilot = driverForCopilot;
exports.tripForCopilot = tripForCopilot;
exports.recentTripsForCopilot = recentTripsForCopilot;
exports.sanitizeCopilotText = sanitizeCopilotText;
const policies = {
    OWNER: { recentTripDetails: true, driverLicenseNumbers: true, tripRevenue: true, financialAnalytics: true },
    ADMIN: { recentTripDetails: true, driverLicenseNumbers: true, tripRevenue: true, financialAnalytics: true },
    FLEET_MANAGER: { recentTripDetails: true, driverLicenseNumbers: true, tripRevenue: true, financialAnalytics: true },
    DISPATCHER: { recentTripDetails: true, driverLicenseNumbers: false, tripRevenue: false, financialAnalytics: false },
    SAFETY_OFFICER: { recentTripDetails: false, driverLicenseNumbers: true, tripRevenue: false, financialAnalytics: false },
    FINANCIAL_ANALYST: { recentTripDetails: false, driverLicenseNumbers: false, tripRevenue: false, financialAnalytics: true }
};
function disclosurePolicyForRole(role) { return policies[role]; }
function vehicleForCopilot(vehicle) { return { name: vehicle.name, registrationNo: vehicle.registrationNo, type: vehicle.type, status: vehicle.status, capacityKg: vehicle.capacityKg, requiredLicenseCategory: vehicle.requiredLicenseCategory, region: vehicle.region, odometerKm: vehicle.odometerKm }; }
function driverForCopilot(driver, role) {
    const common = { name: driver.name, licenseCategory: driver.licenseCategory, licenseExpiry: driver.licenseExpiry.toISOString(), status: driver.status, safetyScore: driver.safetyScore };
    return disclosurePolicyForRole(role).driverLicenseNumbers ? { ...common, licenseNo: driver.licenseNo } : common;
}
function tripForCopilot(trip, role) {
    const common = { tripNo: trip.tripNo, source: trip.source, destination: trip.destination, status: trip.status, cargoWeightKg: trip.cargoWeightKg, plannedDistanceKm: trip.plannedDistanceKm, vehicle: trip.vehicle, driver: trip.driver, createdAt: trip.createdAt.toISOString() };
    return disclosurePolicyForRole(role).tripRevenue ? { ...common, revenue: trip.revenue } : common;
}
function recentTripsForCopilot(trips, role) { return disclosurePolicyForRole(role).recentTripDetails ? trips : []; }
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function sanitizeCopilotText(value, restrictedValues = []) {
    let output = value;
    for (const restricted of [...new Set(restrictedValues.filter(item => item.length >= 6))])
        output = output.replace(new RegExp(escapeRegExp(restricted), 'gi'), '[restricted]');
    return output
        .replace(/eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}/g, '[restricted token]')
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[restricted id]')
        .replace(/\bc[a-z0-9]{24,31}\b/gi, '[restricted id]')
        .trim();
}
