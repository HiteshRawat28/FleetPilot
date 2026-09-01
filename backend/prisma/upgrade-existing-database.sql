-- Data-preserving upgrade from FleetPilot's original single-company schema.
-- Run with: npm run db:upgrade

-- PostgreSQL requires newly added enum values to be committed before they can
-- be used by later statements.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'OWNER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ADMIN';
COMMIT;

BEGIN;

DO $$
BEGIN
  CREATE TYPE "LicenseCategory" AS ENUM ('LMV', 'HMV', 'MCWG');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

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
  ADD COLUMN IF NOT EXISTS "googleSub" TEXT,
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Vehicle"
  ADD COLUMN IF NOT EXISTS "requiredLicenseCategory" "LicenseCategory" NOT NULL DEFAULT 'LMV';
ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Maintenance" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "FuelLog" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

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

COMMIT;
