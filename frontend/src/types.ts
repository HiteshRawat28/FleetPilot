export type LicenseCategory = "LMV" | "HMV" | "MCWG";
export type Vehicle = {
  id: string;
  registrationNo: string;
  name: string;
  type: string;
  capacityKg: number;
  requiredLicenseCategory: LicenseCategory;
  odometerKm: number;
  acquisitionCost: number;
  status: "AVAILABLE" | "ON_TRIP" | "IN_SHOP" | "RETIRED";
  region: string;
};
export type VehicleDetails = {
  vehicle: Vehicle & { createdAt: string };
  summary: {
    totalTrips: number;
    completedTrips: number;
    totalDistanceKm: number;
    maintenanceCost: number;
    fuelCost: number;
    fuelLiters: number;
    otherExpenses: number;
  };
  activeTrip:
    | (Trip & {
        startOdometerKm?: number | null;
        finalOdometerKm?: number | null;
        completedAt?: string | null;
        dispatchedAt?: string | null;
      })
    | null;
  driverUsage: Array<{
    driver: Driver;
    tripCount: number;
    completedTrips: number;
    totalDistanceKm: number;
    lastUsedAt: string;
  }>;
  trips: Array<
    Trip & {
      startOdometerKm?: number | null;
      finalOdometerKm?: number | null;
      completedAt?: string | null;
      dispatchedAt?: string | null;
    }
  >;
  maintenance: Array<
    Maintenance & {
      driver?: Pick<Driver, "id" | "name"> | null;
      reportedOdometerKm?: number | null;
      severity?: string | null;
    }
  >;
  fuelLogs: Array<{
    id: string;
    liters: number;
    cost: number;
    date: string;
    odometerKm?: number | null;
    fuelStation?: string | null;
    driver?: Pick<Driver, "id" | "name"> | null;
  }>;
  expenses: Array<{
    id: string;
    type: "TOLL" | "REPAIR" | "INSURANCE" | "DRIVER_PAYMENT" | "OTHER";
    description?: string | null;
    vendor?: string | null;
    amount: number;
    date: string;
    submittedByDriver?: Pick<Driver, "id" | "name"> | null;
  }>;
};
export type Driver = {
  id: string;
  name: string;
  licenseNo: string;
  licenseCategory: LicenseCategory;
  licenseExpiry: string;
  contact: string;
  payType?: "PER_TRIP" | "HOURLY";
  payRate?: number;
  safetyScore: number;
  status: "AVAILABLE" | "ON_TRIP" | "OFF_DUTY" | "SUSPENDED";
  userId?: string | null;
  onboardingStatus?: "PENDING" | "NEEDS_REVIEW" | "VERIFIED" | "REJECTED";
  reviewNote?: string | null;
};
export type AssignmentFailureReason = {
  code: string;
  message: string;
  field?: "vehicleId" | "driverId" | "cargoWeightKg" | "tripId";
  details?: Record<string, string | number>;
};
export type TollEstimateStatus =
  | "ESTIMATED"
  | "HISTORICAL_ESTIMATE"
  | "NO_TOLLS_EXPECTED"
  | "TOLLS_PRESENT_PRICE_UNKNOWN"
  | "UNAVAILABLE";
export type Place = {
  id: string;
  name: string;
  label: string;
  city?: string;
  state: string;
  latitude: number;
  longitude: number;
  provider: "GOOGLE" | "PHOTON" | "BUILT_IN";
};
export type RouteOption = {
  id: "SHORTEST" | "FASTEST" | "TOLL_SAVER";
  label: string;
  strategy: string;
  distanceKm: number;
  durationMinutes: number;
  estimatedToll: number | null;
  tollEstimateStatus: TollEstimateStatus;
  tollEstimateSource:
    | "PROVIDER"
    | "HISTORICAL_CORRIDOR"
    | "HISTORICAL_VEHICLE_CLASS"
    | "HISTORICAL_FLEET_NORMALIZED"
    | "UNAVAILABLE";
  tollConfidence: "LOW" | "MEDIUM" | "HIGH" | null;
  tollSampleSize: number;
  tollEstimatedAt: string | null;
  via: string;
  provider: "GOOGLE" | "VALHALLA";
  recommended: boolean;
};
export type RouteEstimateResponse = {
  source: Place;
  destination: Place;
  options: RouteOption[];
};
export type TripProfitabilityEstimate = {
  expectedRevenueInr: number;
  estimatedFuelCostInr: number;
  estimatedMaintenanceCostInr: number;
  estimatedTollsInr: number | null;
  estimatedTotalCostInr: number | null;
  estimatedProfitInr: number | null;
  profitMarginPercent: number | null;
  fuelRatePerKmInr: number;
  fuelPricePerLitreInr: number | null;
  fuelEfficiencyKmPerLitre: number | null;
  fuelPriceAsOf: string | null;
  maintenanceRatePerKmInr: number;
  fuelRateSource:
    "RECENT_FUEL_AND_TRIP_HISTORY" | "VAN" | "TRUCK" | "BUS" | "DEFAULT";
  maintenanceRateSource: "HISTORICAL_MAINTENANCE" | "DEPRECIATION_HEURISTIC";
  estimateStatus: "COMPLETE" | "PARTIAL_TOLLS_UNAVAILABLE";
};
export type Trip = {
  id: string;
  tripNo: string;
  source: string;
  destination: string;
  cargoWeightKg: number;
  plannedDistanceKm: number;
  revenue: number;
  estimatedTollsInr: number | null;
  estimatedDurationMin?: number;
  routeSummary?: string;
  routeProvider?: "GOOGLE" | "VALHALLA";
  tollEstimateStatus?: TollEstimateStatus;
  routeEstimatedAt?: string;
  status: "DRAFT" | "DISPATCHED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  vehicle: Vehicle;
  driver: Driver;
  createdAt: string;
};
export type TripLocationPoint = {
  id: string;
  latitude: number;
  longitude: number;
  accuracyM: number;
  speedKph?: number | null;
  headingDeg?: number | null;
  altitudeM?: number | null;
  batteryPct?: number | null;
  isMocked?: boolean | null;
  capturedAt: string;
  receivedAt: string;
};
export type TripTracking = {
  trip: {
    id: string;
    tripNo: string;
    status: Trip["status"];
    source: string;
    destination: string;
    sourceLatitude?: number | null;
    sourceLongitude?: number | null;
    destinationLatitude?: number | null;
    destinationLongitude?: number | null;
    routePolyline?: string | null;
    driver: { id: string; name: string; contact: string };
    vehicle: { id: string; name: string; registrationNo: string };
  };
  trackingStatus: "WAITING_FOR_GPS" | "LIVE" | "DELAYED" | "OFFLINE" | "ENDED";
  latestLocation: TripLocationPoint | null;
  history: TripLocationPoint[];
  trustWarning?: string | null;
  serverTime: string;
};
export type TripExpense = {
  id: string;
  type:
    | "FOOD"
    | "LODGING"
    | "PARKING"
    | "TOLL"
    | "REPAIR"
    | "INSURANCE"
    | "DRIVER_PAYMENT"
    | "OTHER";
  description?: string | null;
  vendor?: string | null;
  amount: number;
  date: string;
  source: "WEB" | "DRIVER_MOBILE" | "FASTAG";
  receiptUrl?: string | null;
  receiptOriginalName?: string | null;
  receiptMimeType?: string | null;
  ocrConfidence?: number | null;
  submittedByDriver?: { id: string; name: string } | null;
  fastagTransaction?: {
    id: string;
    providerTxnId: string;
    plazaName: string;
    lane?: string | null;
    status: string;
  } | null;
};
export type TripFuelLog = {
  id: string;
  liters: number;
  cost: number;
  date: string;
  odometerKm?: number | null;
  fuelStation?: string | null;
  source: "WEB" | "DRIVER_MOBILE" | "FASTAG";
  receiptUrl?: string | null;
  receiptOriginalName?: string | null;
  ocrConfidence?: number | null;
  driver?: { id: string; name: string } | null;
};
export type TripMaintenance = {
  id: string;
  serviceType: string;
  description?: string | null;
  severity?: string | null;
  reportedOdometerKm?: number | null;
  cost: number;
  source: "WEB" | "DRIVER_MOBILE" | "FASTAG";
  startDate: string;
  endDate?: string | null;
  status: string;
  photoUrl?: string | null;
  photoOriginalName?: string | null;
  driver?: { id: string; name: string } | null;
};
export type TripEvidence = {
  id: string;
  type: string;
  note?: string | null;
  createdAt: string;
  url?: string | null;
  originalName?: string | null;
  ocrConfidence?: number | null;
  extractedOdometerKm?: number | null;
  amount?: number | null;
  fuelLiters?: number | null;
  fuelStation?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  driver: { id: string; name: string };
};
export type TripDetails = Trip & {
  dispatchedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  startOdometerKm?: number | null;
  finalOdometerKm?: number | null;
  fuelConsumedL?: number | null;
  driver: Driver & {
    user?: { email: string; lastActiveAt?: string | null } | null;
  };
  expenses: TripExpense[];
  fuelLogs: TripFuelLog[];
  maintenance: TripMaintenance[];
  evidence: TripEvidence[];
  financialSummary: {
    revenue: number;
    fuelCost: number;
    expenseCost: number;
    maintenanceCost: number;
    driverPayout: number;
    tollCost: number;
    actualCost: number;
    profit: number;
    marginPercent: number | null;
    costPerKm: number | null;
    unallocatedCandidateCount: number;
    unallocatedCandidateCost: number;
  };
};
export type GlobalSearchResult = {
  type: "DRIVER" | "VEHICLE" | "TRIP";
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  context?: string;
};
export type GlobalSearchResponse = {
  query: string;
  results: GlobalSearchResult[];
};
export type NotificationType =
  | "TRIP_CREATED"
  | "TRIP_DISPATCHED"
  | "TRIP_STARTED"
  | "TRIP_COMPLETED"
  | "TRIP_CANCELLED";
export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  tripId?: string | null;
  readAt?: string | null;
  createdAt: string;
};
export type NotificationResponse = {
  items: AppNotification[];
  unreadCount: number;
};
export type Maintenance = {
  id: string;
  serviceType: string;
  description?: string;
  cost: number;
  startDate: string;
  endDate?: string;
  status: "ACTIVE" | "CLOSED";
  vehicle: Vehicle;
};
export type Finance = {
  fuelLogs: Array<{
    id: string;
    liters: number;
    cost: number;
    date: string;
    vehicle: Vehicle;
  }>;
  expenses: Array<{
    id: string;
    type: "TOLL" | "REPAIR" | "INSURANCE" | "DRIVER_PAYMENT" | "OTHER";
    description?: string;
    amount: number;
    date: string;
    vehicle: Vehicle;
    receiptUrl?: string | null;
    receiptOriginalName?: string | null;
    ocrConfidence?: number | null;
    submittedByDriver?: { id: string; name: string } | null;
  }>;
};
export type AnalyticsData = {
  generatedAt: string;
  summary: {
    fuelEfficiency: number;
    fleetUtilization: number;
    operationalCost: number;
    vehicleRoi: number;
    realizedRevenue: number;
    realizedProfit: number;
    profitMargin: number | null;
    costPerKm: number | null;
    completedTrips: number;
    totalDistanceKm: number;
    activeVehicles: number;
  };
  costBreakdown: {
    fuel: number;
    maintenance: number;
    tolls: number;
    driverPayments: number;
    otherExpenses: number;
  };
  statusDistribution: Array<{
    status: "AVAILABLE" | "ON_TRIP" | "IN_SHOP" | "RETIRED";
    count: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    label: string;
    revenue: number;
    cost: number;
    profit: number;
    completedTrips: number;
  }>;
  byVehicle: Array<{
    id: string;
    name: string;
    registrationNo: string;
    type: string;
    region: string;
    status: Vehicle["status"];
    completedTrips: number;
    totalTrips: number;
    distanceKm: number;
    revenue: number;
    fuelCost: number;
    maintenanceCost: number;
    expenseCost: number;
    operationalCost: number;
    profit: number;
    marginPercent: number | null;
    costPerKm: number | null;
    roi: number | null;
  }>;
};
