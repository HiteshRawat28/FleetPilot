-- Data-preserving upgrade from FleetPilot's original single-company schema.
-- Run with: npm run db:upgrade

-- PostgreSQL requires newly added enum values to be committed before they can
-- be used by later statements.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'OWNER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ADMIN';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LicenseCategory') THEN
    CREATE TYPE "LicenseCategory" AS ENUM ('LMV', 'HMV', 'MCWG');
  ELSE
    ALTER TYPE "LicenseCategory" ADD VALUE IF NOT EXISTS 'LMV';
    ALTER TYPE "LicenseCategory" ADD VALUE IF NOT EXISTS 'HMV';
    ALTER TYPE "LicenseCategory" ADD VALUE IF NOT EXISTS 'MCWG';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DriverPayType') THEN
    CREATE TYPE "DriverPayType" AS ENUM ('PER_TRIP', 'HOURLY');
  END IF;
END $$;
ALTER TYPE "ExpenseType" ADD VALUE IF NOT EXISTS 'DRIVER_PAYMENT';
COMMIT;

BEGIN;

CREATE TABLE IF NOT EXISTS "Organization" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "operationsEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Organization_slug_key"
  ON "Organization"("slug");

INSERT INTO "Organization" ("id", "name", "slug", "operationsEmail")
SELECT
  'legacy-organization',
  'FleetPilot',
  'fleetpilot-legacy',
  (SELECT "email" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM "Organization" WHERE "id" = 'legacy-organization'
);

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "phone" TEXT,
  ADD COLUMN IF NOT EXISTS "jobTitle" TEXT,
  ADD COLUMN IF NOT EXISTS "avatarKey" TEXT,
  ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "googleSub" TEXT,
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Driver"
  ADD COLUMN IF NOT EXISTS "payType" "DriverPayType" NOT NULL DEFAULT 'PER_TRIP',
  ADD COLUMN IF NOT EXISTS "payRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "estimatedTollsInr" DOUBLE PRECISION;
ALTER TABLE "Trip" ALTER COLUMN "estimatedTollsInr" DROP DEFAULT;
ALTER TABLE "Trip" ALTER COLUMN "estimatedTollsInr" DROP NOT NULL;
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "estimatedDurationMin" INTEGER;
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "routeSummary" TEXT;
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "routeProvider" TEXT;
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "tollEstimateStatus" TEXT;
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "routeEstimatedAt" TIMESTAMP(3);
ALTER TABLE "Maintenance" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "FuelLog" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Vehicle"
  ADD COLUMN IF NOT EXISTS "requiredLicenseCategory" "LicenseCategory" NOT NULL DEFAULT 'LMV';

UPDATE "User" SET "organizationId" = 'legacy-organization' WHERE "organizationId" IS NULL;
UPDATE "Vehicle" SET "organizationId" = 'legacy-organization' WHERE "organizationId" IS NULL;
UPDATE "Driver" SET "organizationId" = 'legacy-organization' WHERE "organizationId" IS NULL;
UPDATE "Trip" SET "organizationId" = 'legacy-organization' WHERE "organizationId" IS NULL;
UPDATE "Maintenance" SET "organizationId" = 'legacy-organization' WHERE "organizationId" IS NULL;
UPDATE "FuelLog" SET "organizationId" = 'legacy-organization' WHERE "organizationId" IS NULL;
UPDATE "Expense" SET "organizationId" = 'legacy-organization' WHERE "organizationId" IS NULL;

-- The first fleet manager becomes the owner of the migrated company.
UPDATE "User"
SET "role" = 'OWNER'
WHERE "id" = (
  SELECT "id"
  FROM "User"
  WHERE "role" = 'FLEET_MANAGER'
  ORDER BY "createdAt" ASC
  LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM "User" WHERE "role" = 'OWNER');

ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Vehicle" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Driver" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Trip" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Maintenance" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "FuelLog" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Expense" ALTER COLUMN "organizationId" SET NOT NULL;

DROP INDEX IF EXISTS "Vehicle_registrationNo_key";
DROP INDEX IF EXISTS "Driver_licenseNo_key";
DROP INDEX IF EXISTS "Trip_tripNo_key";

CREATE UNIQUE INDEX IF NOT EXISTS "User_googleSub_key" ON "User"("googleSub");
CREATE INDEX IF NOT EXISTS "User_organizationId_idx" ON "User"("organizationId");
CREATE INDEX IF NOT EXISTS "Vehicle_organizationId_idx" ON "Vehicle"("organizationId");
CREATE INDEX IF NOT EXISTS "Driver_organizationId_idx" ON "Driver"("organizationId");
CREATE INDEX IF NOT EXISTS "Trip_organizationId_idx" ON "Trip"("organizationId");
CREATE INDEX IF NOT EXISTS "Maintenance_organizationId_idx" ON "Maintenance"("organizationId");
CREATE INDEX IF NOT EXISTS "FuelLog_organizationId_idx" ON "FuelLog"("organizationId");
CREATE INDEX IF NOT EXISTS "Expense_organizationId_idx" ON "Expense"("organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "Vehicle_organizationId_registrationNo_key"
  ON "Vehicle"("organizationId", "registrationNo");
CREATE UNIQUE INDEX IF NOT EXISTS "Driver_organizationId_licenseNo_key"
  ON "Driver"("organizationId", "licenseNo");
CREATE UNIQUE INDEX IF NOT EXISTS "Trip_organizationId_tripNo_key"
  ON "Trip"("organizationId", "tripNo");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_organizationId_fkey') THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Vehicle_organizationId_fkey') THEN
    ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Driver_organizationId_fkey') THEN
    ALTER TABLE "Driver" ADD CONSTRAINT "Driver_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Trip_organizationId_fkey') THEN
    ALTER TABLE "Trip" ADD CONSTRAINT "Trip_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Maintenance_organizationId_fkey') THEN
    ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FuelLog_organizationId_fkey') THEN
    ALTER TABLE "FuelLog" ADD CONSTRAINT "FuelLog_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Expense_organizationId_fkey') THEN
    ALTER TABLE "Expense" ADD CONSTRAINT "Expense_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "CopilotAction" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "request" JSONB NOT NULL,
  "result" JSONB,
  "tripId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CopilotAction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CopilotAction_organizationId_idempotencyKey_key"
  ON "CopilotAction"("organizationId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "CopilotAction_organizationId_createdAt_idx"
  ON "CopilotAction"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "CopilotAction_userId_idx" ON "CopilotAction"("userId");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CopilotAction_organizationId_fkey') THEN
    ALTER TABLE "CopilotAction" ADD CONSTRAINT "CopilotAction_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CopilotAction_userId_fkey') THEN
    ALTER TABLE "CopilotAction" ADD CONSTRAINT "CopilotAction_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CopilotAction_tripId_fkey') THEN
    ALTER TABLE "CopilotAction" ADD CONSTRAINT "CopilotAction_tripId_fkey"
      FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
