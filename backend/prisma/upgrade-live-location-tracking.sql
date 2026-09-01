CREATE TABLE IF NOT EXISTS "TripLocation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "accuracyM" DOUBLE PRECISION NOT NULL,
  "speedKph" DOUBLE PRECISION,
  "headingDeg" DOUBLE PRECISION,
  "altitudeM" DOUBLE PRECISION,
  "batteryPct" INTEGER,
  "isMocked" BOOLEAN,
  "capturedAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TripLocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TripLocation_tripId_clientRequestId_key" ON "TripLocation"("tripId", "clientRequestId");
CREATE INDEX IF NOT EXISTS "TripLocation_organizationId_capturedAt_idx" ON "TripLocation"("organizationId", "capturedAt");
CREATE INDEX IF NOT EXISTS "TripLocation_tripId_capturedAt_idx" ON "TripLocation"("tripId", "capturedAt");
CREATE INDEX IF NOT EXISTS "TripLocation_driverId_capturedAt_idx" ON "TripLocation"("driverId", "capturedAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='TripLocation_organizationId_fkey') THEN
    ALTER TABLE "TripLocation" ADD CONSTRAINT "TripLocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='TripLocation_tripId_fkey') THEN
    ALTER TABLE "TripLocation" ADD CONSTRAINT "TripLocation_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='TripLocation_driverId_fkey') THEN
    ALTER TABLE "TripLocation" ADD CONSTRAINT "TripLocation_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
