export type LicenseCategory='LMV'|'HMV'|'MCWG';
export type Vehicle={id:string;registrationNo:string;name:string;type:string;capacityKg:number;requiredLicenseCategory:LicenseCategory;odometerKm:number;acquisitionCost:number;status:'AVAILABLE'|'ON_TRIP'|'IN_SHOP'|'RETIRED';region:string};
export type Driver={id:string;name:string;licenseNo:string;licenseCategory:LicenseCategory;licenseExpiry:string;contact:string;safetyScore:number;status:'AVAILABLE'|'ON_TRIP'|'OFF_DUTY'|'SUSPENDED'};
export type AssignmentFailureReason={code:string;message:string;field?:'vehicleId'|'driverId'|'cargoWeightKg'|'tripId';details?:Record<string,string|number>};
export type Trip={id:string;tripNo:string;source:string;destination:string;cargoWeightKg:number;plannedDistanceKm:number;status:'DRAFT'|'DISPATCHED'|'COMPLETED'|'CANCELLED';vehicle:Vehicle;driver:Driver;createdAt:string};
export type Maintenance={id:string;serviceType:string;description?:string;cost:number;startDate:string;endDate?:string;status:'ACTIVE'|'CLOSED';vehicle:Vehicle};
export type Finance={fuelLogs:Array<{id:string;liters:number;cost:number;date:string;vehicle:Vehicle}>;expenses:Array<{id:string;type:string;description?:string;amount:number;date:string;vehicle:Vehicle}>};
