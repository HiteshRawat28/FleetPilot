"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssignmentEligibilityError = void 0;
exports.evaluateAssignment = evaluateAssignment;
exports.assertAssignmentEligible = assertAssignmentEligible;
const client_1 = require("@prisma/client");
const number = (value) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value);
const day = (value) => value.toISOString().slice(0, 10);
function evaluateAssignment(input) {
    const reasons = [];
    const now = input.now ?? new Date();
    const { vehicle, driver } = input;
    if (input.tripStatus && input.tripStatus !== client_1.TripStatus.DRAFT) {
        reasons.push({
            code: 'TRIP_NOT_DRAFT',
            field: 'tripId',
            message: `Only draft trips can be dispatched; this trip is ${input.tripStatus.toLowerCase().replace('_', ' ')}.`,
            details: { tripStatus: input.tripStatus }
        });
    }
    if (!vehicle) {
        reasons.push({ code: 'VEHICLE_NOT_FOUND', field: 'vehicleId', message: 'The selected vehicle no longer exists.' });
    }
    else {
        if (vehicle.status === client_1.VehicleStatus.ON_TRIP) {
            const trip = input.vehicleTripNo ? ` on ${input.vehicleTripNo}` : '';
            reasons.push({
                code: 'VEHICLE_ON_TRIP',
                field: 'vehicleId',
                message: `${vehicle.name} is already assigned${trip}.`,
                details: { vehicleStatus: vehicle.status, ...(input.vehicleTripNo ? { tripNo: input.vehicleTripNo } : {}) }
            });
        }
        else if (vehicle.status === client_1.VehicleStatus.IN_SHOP) {
            const service = input.maintenanceService ? ` for ${input.maintenanceService}` : '';
            reasons.push({
                code: 'VEHICLE_IN_MAINTENANCE',
                field: 'vehicleId',
                message: `${vehicle.name} is in maintenance${service}.`,
                details: { vehicleStatus: vehicle.status, ...(input.maintenanceService ? { serviceType: input.maintenanceService } : {}) }
            });
        }
        else if (vehicle.status === client_1.VehicleStatus.RETIRED) {
            reasons.push({
                code: 'VEHICLE_RETIRED',
                field: 'vehicleId',
                message: `${vehicle.name} is retired and cannot be assigned.`,
                details: { vehicleStatus: vehicle.status }
            });
        }
        if (input.cargoWeightKg > vehicle.capacityKg) {
            const excessKg = input.cargoWeightKg - vehicle.capacityKg;
            reasons.push({
                code: 'CARGO_OVER_CAPACITY',
                field: 'cargoWeightKg',
                message: `Cargo exceeds ${vehicle.name}'s capacity by ${number(excessKg)} kg.`,
                details: { cargoWeightKg: input.cargoWeightKg, capacityKg: vehicle.capacityKg, excessKg }
            });
        }
    }
    if (!driver) {
        reasons.push({ code: 'DRIVER_NOT_FOUND', field: 'driverId', message: 'The selected driver no longer exists.' });
    }
    else {
        if (driver.status === client_1.DriverStatus.ON_TRIP) {
            const trip = input.driverTripNo ? ` on ${input.driverTripNo}` : '';
            reasons.push({
                code: 'DRIVER_ON_TRIP',
                field: 'driverId',
                message: `${driver.name} is already assigned${trip}.`,
                details: { driverStatus: driver.status, ...(input.driverTripNo ? { tripNo: input.driverTripNo } : {}) }
            });
        }
        else if (driver.status === client_1.DriverStatus.OFF_DUTY) {
            reasons.push({
                code: 'DRIVER_OFF_DUTY',
                field: 'driverId',
                message: `${driver.name} is off duty.`,
                details: { driverStatus: driver.status }
            });
        }
        else if (driver.status === client_1.DriverStatus.SUSPENDED) {
            reasons.push({
                code: 'DRIVER_SUSPENDED',
                field: 'driverId',
                message: `${driver.name} is suspended.`,
                details: { driverStatus: driver.status }
            });
        }
        if (driver.licenseExpiry <= now) {
            reasons.push({
                code: 'LICENSE_EXPIRED',
                field: 'driverId',
                message: `${driver.name}'s licence expired on ${day(driver.licenseExpiry)}.`,
                details: { expiryDate: day(driver.licenseExpiry) }
            });
        }
        if (vehicle && driver.licenseCategory !== vehicle.requiredLicenseCategory) {
            reasons.push({
                code: 'LICENSE_CATEGORY_MISMATCH',
                field: 'driverId',
                message: `${vehicle.name} requires a ${vehicle.requiredLicenseCategory} licence; ${driver.name} holds ${driver.licenseCategory}.`,
                details: { requiredCategory: vehicle.requiredLicenseCategory, driverCategory: driver.licenseCategory }
            });
        }
    }
    return reasons;
}
class AssignmentEligibilityError extends Error {
    reasons;
    status = 409;
    code = 'ASSIGNMENT_FAILED';
    constructor(reasons) {
        super(`Assignment failed for ${reasons.length} ${reasons.length === 1 ? 'reason' : 'reasons'}.`);
        this.reasons = reasons;
        this.name = 'AssignmentEligibilityError';
    }
}
exports.AssignmentEligibilityError = AssignmentEligibilityError;
function assertAssignmentEligible(input) {
    const reasons = evaluateAssignment(input);
    if (reasons.length)
        throw new AssignmentEligibilityError(reasons);
}
