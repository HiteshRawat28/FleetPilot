-- Data-preserving FleetPilot trip dispatch, driver evidence and FASTag upgrade.
-- Run after the base organization upgrade with: npm run db:upgrade:trip-dispatch

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DRIVER';
ALTER TYPE "TripStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
ALTER TYPE "MaintenanceStatus" ADD VALUE IF NOT EXISTS 'REPORTED';
ALTER TYPE "ExpenseType" ADD VALUE IF NOT EXISTS 'FOOD';
ALTER TYPE "ExpenseType" ADD VALUE IF NOT EXISTS 'LODGING';
ALTER TYPE "ExpenseType" ADD VALUE IF NOT EXISTS 'PARKING';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='DriverOnboardingStatus') THEN CREATE TYPE "DriverOnboardingStatus" AS ENUM ('PENDING','NEEDS_REVIEW','VERIFIED','REJECTED'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='DriverDocumentType') THEN CREATE TYPE "DriverDocumentType" AS ENUM ('PROFILE_PHOTO','LICENSE_FRONT','LICENSE_BACK'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='TripEvidenceType') THEN CREATE TYPE "TripEvidenceType" AS ENUM ('ODOMETER_START','ODOMETER_END','SITE_UPDATE','FUEL_RECEIPT','EXPENSE_RECEIPT','MAINTENANCE_REPORT'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='RecordSource') THEN CREATE TYPE "RecordSource" AS ENUM ('WEB','DRIVER_MOBILE','FASTAG'); ELSE ALTER TYPE "RecordSource" ADD VALUE IF NOT EXISTS 'FASTAG'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='FastagConnectionStatus') THEN CREATE TYPE "FastagConnectionStatus" AS ENUM ('PENDING','ACTIVE','ERROR','DISCONNECTED'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='FastagTransactionStatus') THEN CREATE TYPE "FastagTransactionStatus" AS ENUM ('PENDING','SETTLED','REVERSED','DISPUTED'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='TollMatchStatus') THEN CREATE TYPE "TollMatchStatus" AS ENUM ('MATCHED','REVIEW_REQUIRED','UNMATCHED'); END IF;
END $$;
COMMIT;

BEGIN;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Driver"
  ADD COLUMN IF NOT EXISTS "onboardingStatus" "DriverOnboardingStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "userId" TEXT,
  ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewedById" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewNote" TEXT;

ALTER TABLE "Trip"
  ADD COLUMN IF NOT EXISTS "sourceCityId" TEXT,
  ADD COLUMN IF NOT EXISTS "destinationCityId" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceLatitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "sourceLongitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "destinationLatitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "destinationLongitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "estimatedDurationMinutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "estimatedToll" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "routeStrategy" TEXT,
  ADD COLUMN IF NOT EXISTS "routeLabel" TEXT,
  ADD COLUMN IF NOT EXISTS "routeVia" TEXT,
  ADD COLUMN IF NOT EXISTS "routeProvider" TEXT,
  ADD COLUMN IF NOT EXISTS "routePolyline" TEXT,
  ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "startOdometerKm" DOUBLE PRECISION;

ALTER TABLE "Maintenance"
  ADD COLUMN IF NOT EXISTS "tripId" TEXT,
  ADD COLUMN IF NOT EXISTS "driverId" TEXT,
  ADD COLUMN IF NOT EXISTS "severity" TEXT,
  ADD COLUMN IF NOT EXISTS "reportedOdometerKm" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "source" "RecordSource" NOT NULL DEFAULT 'WEB',
  ADD COLUMN IF NOT EXISTS "objectKey" TEXT,
  ADD COLUMN IF NOT EXISTS "mimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "originalName" TEXT,
  ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;
ALTER TABLE "Maintenance" ALTER COLUMN "cost" SET DEFAULT 0;

ALTER TABLE "FuelLog"
  ADD COLUMN IF NOT EXISTS "tripId" TEXT,
  ADD COLUMN IF NOT EXISTS "driverId" TEXT,
  ADD COLUMN IF NOT EXISTS "fuelStation" TEXT,
  ADD COLUMN IF NOT EXISTS "source" "RecordSource" NOT NULL DEFAULT 'WEB',
  ADD COLUMN IF NOT EXISTS "receiptObjectKey" TEXT,
  ADD COLUMN IF NOT EXISTS "receiptMimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "receiptName" TEXT,
  ADD COLUMN IF NOT EXISTS "ocrConfidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "extractedData" JSONB,
  ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;

ALTER TABLE "Expense"
  ADD COLUMN IF NOT EXISTS "tripId" TEXT,
  ADD COLUMN IF NOT EXISTS "driverId" TEXT,
  ADD COLUMN IF NOT EXISTS "vendor" TEXT,
  ADD COLUMN IF NOT EXISTS "source" "RecordSource" NOT NULL DEFAULT 'WEB',
  ADD COLUMN IF NOT EXISTS "receiptObjectKey" TEXT,
  ADD COLUMN IF NOT EXISTS "receiptMimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "receiptName" TEXT,
  ADD COLUMN IF NOT EXISTS "ocrConfidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "extractedData" JSONB,
  ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;

CREATE TABLE IF NOT EXISTS "DriverDocument" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "type" "DriverDocumentType" NOT NULL,
  "objectKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "size" INTEGER NOT NULL DEFAULT 0,
  "extractedData" JSONB,
  "ocrConfidence" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "DriverDocument"
  ADD COLUMN IF NOT EXISTS "size" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "TripEvidence" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "type" "TripEvidenceType" NOT NULL,
  "objectKey" TEXT,
  "mimeType" TEXT,
  "originalName" TEXT,
  "extractedOdometerKm" DOUBLE PRECISION,
  "ocrConfidence" DOUBLE PRECISION,
  "registrationNo" TEXT,
  "note" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "fuelLiters" DOUBLE PRECISION,
  "amount" DOUBLE PRECISION,
  "fuelStation" TEXT,
  "clientRequestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "FastagConnection" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "issuerName" TEXT NOT NULL,
  "maskedTagId" TEXT,
  "externalCustomerId" TEXT,
  "status" "FastagConnectionStatus" NOT NULL DEFAULT 'PENDING',
  "lastSyncedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "FastagTransaction" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "tripId" TEXT,
  "expenseId" TEXT,
  "providerTxnId" TEXT NOT NULL,
  "maskedTagId" TEXT,
  "plazaName" TEXT NOT NULL,
  "lane" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" "FastagTransactionStatus" NOT NULL DEFAULT 'PENDING',
  "matchStatus" "TollMatchStatus" NOT NULL DEFAULT 'UNMATCHED',
  "matchConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rawPayload" JSONB,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "Driver_userId_key" ON "Driver"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "DriverDocument_driverId_type_key" ON "DriverDocument"("driverId","type");
CREATE UNIQUE INDEX IF NOT EXISTS "DriverDocument_objectKey_key" ON "DriverDocument"("objectKey");
CREATE INDEX IF NOT EXISTS "DriverDocument_organizationId_driverId_idx" ON "DriverDocument"("organizationId","driverId");
CREATE UNIQUE INDEX IF NOT EXISTS "TripEvidence_objectKey_key" ON "TripEvidence"("objectKey");
CREATE UNIQUE INDEX IF NOT EXISTS "TripEvidence_clientRequestId_key" ON "TripEvidence"("clientRequestId");
CREATE INDEX IF NOT EXISTS "TripEvidence_tripId_createdAt_idx" ON "TripEvidence"("tripId","createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Maintenance_objectKey_key" ON "Maintenance"("objectKey");
CREATE UNIQUE INDEX IF NOT EXISTS "Maintenance_clientRequestId_key" ON "Maintenance"("clientRequestId");
CREATE UNIQUE INDEX IF NOT EXISTS "FuelLog_receiptObjectKey_key" ON "FuelLog"("receiptObjectKey");
CREATE UNIQUE INDEX IF NOT EXISTS "FuelLog_clientRequestId_key" ON "FuelLog"("clientRequestId");
CREATE UNIQUE INDEX IF NOT EXISTS "Expense_receiptObjectKey_key" ON "Expense"("receiptObjectKey");
CREATE UNIQUE INDEX IF NOT EXISTS "Expense_clientRequestId_key" ON "Expense"("clientRequestId");
CREATE UNIQUE INDEX IF NOT EXISTS "FastagConnection_vehicleId_key" ON "FastagConnection"("vehicleId");
CREATE INDEX IF NOT EXISTS "FastagConnection_organizationId_status_idx" ON "FastagConnection"("organizationId","status");
CREATE UNIQUE INDEX IF NOT EXISTS "FastagTransaction_connectionId_providerTxnId_key" ON "FastagTransaction"("connectionId","providerTxnId");
CREATE UNIQUE INDEX IF NOT EXISTS "FastagTransaction_expenseId_key" ON "FastagTransaction"("expenseId");
CREATE INDEX IF NOT EXISTS "FastagTransaction_organizationId_occurredAt_idx" ON "FastagTransaction"("organizationId","occurredAt");
CREATE INDEX IF NOT EXISTS "FastagTransaction_tripId_matchStatus_idx" ON "FastagTransaction"("tripId","matchStatus");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Driver_userId_fkey') THEN ALTER TABLE "Driver" ADD CONSTRAINT "Driver_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='DriverDocument_organizationId_fkey') THEN ALTER TABLE "DriverDocument" ADD CONSTRAINT "DriverDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='DriverDocument_driverId_fkey') THEN ALTER TABLE "DriverDocument" ADD CONSTRAINT "DriverDocument_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='TripEvidence_organizationId_fkey') THEN ALTER TABLE "TripEvidence" ADD CONSTRAINT "TripEvidence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='TripEvidence_tripId_fkey') THEN ALTER TABLE "TripEvidence" ADD CONSTRAINT "TripEvidence_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='TripEvidence_driverId_fkey') THEN ALTER TABLE "TripEvidence" ADD CONSTRAINT "TripEvidence_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='TripEvidence_vehicleId_fkey') THEN ALTER TABLE "TripEvidence" ADD CONSTRAINT "TripEvidence_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Maintenance_tripId_fkey') THEN ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Maintenance_driverId_fkey') THEN ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='FuelLog_tripId_fkey') THEN ALTER TABLE "FuelLog" ADD CONSTRAINT "FuelLog_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='FuelLog_driverId_fkey') THEN ALTER TABLE "FuelLog" ADD CONSTRAINT "FuelLog_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Expense_tripId_fkey') THEN ALTER TABLE "Expense" ADD CONSTRAINT "Expense_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Expense_driverId_fkey') THEN ALTER TABLE "Expense" ADD CONSTRAINT "Expense_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='FastagConnection_organizationId_fkey') THEN ALTER TABLE "FastagConnection" ADD CONSTRAINT "FastagConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='FastagConnection_vehicleId_fkey') THEN ALTER TABLE "FastagConnection" ADD CONSTRAINT "FastagConnection_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='FastagTransaction_organizationId_fkey') THEN ALTER TABLE "FastagTransaction" ADD CONSTRAINT "FastagTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='FastagTransaction_connectionId_fkey') THEN ALTER TABLE "FastagTransaction" ADD CONSTRAINT "FastagTransaction_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "FastagConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='FastagTransaction_vehicleId_fkey') THEN ALTER TABLE "FastagTransaction" ADD CONSTRAINT "FastagTransaction_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='FastagTransaction_tripId_fkey') THEN ALTER TABLE "FastagTransaction" ADD CONSTRAINT "FastagTransaction_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='FastagTransaction_expenseId_fkey') THEN ALTER TABLE "FastagTransaction" ADD CONSTRAINT "FastagTransaction_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF;
END $$;

UPDATE "Driver" SET "onboardingStatus"='VERIFIED' WHERE "userId" IS NULL;
COMMIT;
