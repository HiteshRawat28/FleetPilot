enum UserRole {
  fleetManager('FLEET_MANAGER', 'Fleet Manager'),
  dispatcher('DISPATCHER', 'Dispatcher'),
  safetyOfficer('SAFETY_OFFICER', 'Safety Officer'),
  financialAnalyst('FINANCIAL_ANALYST', 'Financial Analyst');

  const UserRole(this.apiValue, this.label);
  final String apiValue;
  final String label;

  static UserRole fromApi(String value) =>
      values.firstWhere((role) => role.apiValue == value);
}

class AppUser {
  const AppUser({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
  });
  final String id;
  final String name;
  final String email;
  final UserRole role;

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
    id: json['id'] as String,
    name: json['name'] as String,
    email: json['email'] as String,
    role: UserRole.fromApi(json['role'] as String),
  );
}

double number(dynamic value) => (value as num?)?.toDouble() ?? 0;
DateTime dateTime(dynamic value) => DateTime.parse(value as String).toLocal();

class Vehicle {
  const Vehicle({
    required this.id,
    required this.registrationNo,
    required this.name,
    required this.type,
    required this.capacityKg,
    required this.odometerKm,
    required this.acquisitionCost,
    required this.status,
    required this.region,
  });
  final String id;
  final String registrationNo;
  final String name;
  final String type;
  final double capacityKg;
  final double odometerKm;
  final double acquisitionCost;
  final String status;
  final String region;

  factory Vehicle.fromJson(Map<String, dynamic> json) => Vehicle(
    id: json['id'] as String,
    registrationNo: json['registrationNo'] as String,
    name: json['name'] as String,
    type: json['type'] as String,
    capacityKg: number(json['capacityKg']),
    odometerKm: number(json['odometerKm']),
    acquisitionCost: number(json['acquisitionCost']),
    status: json['status'] as String,
    region: json['region']?.toString() ?? 'Central',
  );
}

class Driver {
  const Driver({
    required this.id,
    required this.name,
    required this.licenseNo,
    required this.licenseCategory,
    required this.licenseExpiry,
    required this.contact,
    required this.safetyScore,
    required this.status,
  });
  final String id;
  final String name;
  final String licenseNo;
  final String licenseCategory;
  final DateTime licenseExpiry;
  final String contact;
  final int safetyScore;
  final String status;

  bool get licenseExpired => licenseExpiry.isBefore(DateTime.now());

  factory Driver.fromJson(Map<String, dynamic> json) => Driver(
    id: json['id'] as String,
    name: json['name'] as String,
    licenseNo: json['licenseNo'] as String,
    licenseCategory: json['licenseCategory'] as String,
    licenseExpiry: dateTime(json['licenseExpiry']),
    contact: json['contact'] as String,
    safetyScore: (json['safetyScore'] as num).toInt(),
    status: json['status'] as String,
  );
}

class Trip {
  const Trip({
    required this.id,
    required this.tripNo,
    required this.source,
    required this.destination,
    required this.cargoWeightKg,
    required this.plannedDistanceKm,
    required this.revenue,
    required this.status,
    required this.vehicle,
    required this.driver,
    required this.createdAt,
    this.finalOdometerKm,
    this.fuelConsumedL,
  });
  final String id;
  final String tripNo;
  final String source;
  final String destination;
  final double cargoWeightKg;
  final double plannedDistanceKm;
  final double revenue;
  final String status;
  final Vehicle vehicle;
  final Driver driver;
  final DateTime createdAt;
  final double? finalOdometerKm;
  final double? fuelConsumedL;

  factory Trip.fromJson(Map<String, dynamic> json) => Trip(
    id: json['id'] as String,
    tripNo: json['tripNo'] as String,
    source: json['source'] as String,
    destination: json['destination'] as String,
    cargoWeightKg: number(json['cargoWeightKg']),
    plannedDistanceKm: number(json['plannedDistanceKm']),
    revenue: number(json['revenue']),
    status: json['status'] as String,
    vehicle: Vehicle.fromJson(json['vehicle'] as Map<String, dynamic>),
    driver: Driver.fromJson(json['driver'] as Map<String, dynamic>),
    createdAt: dateTime(json['createdAt']),
    finalOdometerKm: json['finalOdometerKm'] == null
        ? null
        : number(json['finalOdometerKm']),
    fuelConsumedL: json['fuelConsumedL'] == null
        ? null
        : number(json['fuelConsumedL']),
  );
}

class MaintenanceRecord {
  const MaintenanceRecord({
    required this.id,
    required this.serviceType,
    required this.cost,
    required this.startDate,
    required this.status,
    required this.vehicle,
    this.description,
    this.endDate,
  });
  final String id;
  final String serviceType;
  final String? description;
  final double cost;
  final DateTime startDate;
  final DateTime? endDate;
  final String status;
  final Vehicle vehicle;

  factory MaintenanceRecord.fromJson(Map<String, dynamic> json) =>
      MaintenanceRecord(
        id: json['id'] as String,
        serviceType: json['serviceType'] as String,
        description: json['description']?.toString(),
        cost: number(json['cost']),
        startDate: dateTime(json['startDate']),
        endDate: json['endDate'] == null ? null : dateTime(json['endDate']),
        status: json['status'] as String,
        vehicle: Vehicle.fromJson(json['vehicle'] as Map<String, dynamic>),
      );
}

class FuelLog {
  const FuelLog({
    required this.id,
    required this.liters,
    required this.cost,
    required this.date,
    required this.vehicle,
  });
  final String id;
  final double liters;
  final double cost;
  final DateTime date;
  final Vehicle vehicle;

  factory FuelLog.fromJson(Map<String, dynamic> json) => FuelLog(
    id: json['id'] as String,
    liters: number(json['liters']),
    cost: number(json['cost']),
    date: dateTime(json['date']),
    vehicle: Vehicle.fromJson(json['vehicle'] as Map<String, dynamic>),
  );
}

class Expense {
  const Expense({
    required this.id,
    required this.type,
    required this.amount,
    required this.date,
    required this.vehicle,
    this.description,
  });
  final String id;
  final String type;
  final String? description;
  final double amount;
  final DateTime date;
  final Vehicle vehicle;

  factory Expense.fromJson(Map<String, dynamic> json) => Expense(
    id: json['id'] as String,
    type: json['type'] as String,
    description: json['description']?.toString(),
    amount: number(json['amount']),
    date: dateTime(json['date']),
    vehicle: Vehicle.fromJson(json['vehicle'] as Map<String, dynamic>),
  );
}

class AnalyticsVehicle {
  const AnalyticsVehicle({
    required this.id,
    required this.name,
    required this.registrationNo,
    required this.operationalCost,
    required this.roi,
  });
  final String id;
  final String name;
  final String registrationNo;
  final double operationalCost;
  final double roi;

  factory AnalyticsVehicle.fromJson(Map<String, dynamic> json) =>
      AnalyticsVehicle(
        id: json['id'] as String,
        name: json['name'] as String,
        registrationNo: json['registrationNo'] as String,
        operationalCost: number(json['operationalCost']),
        roi: number(json['roi']),
      );
}
