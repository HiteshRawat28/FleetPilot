CREATE TABLE "CopilotAction" (
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

CREATE UNIQUE INDEX "CopilotAction_organizationId_idempotencyKey_key"
  ON "CopilotAction"("organizationId", "idempotencyKey");
CREATE INDEX "CopilotAction_organizationId_createdAt_idx"
  ON "CopilotAction"("organizationId", "createdAt");
CREATE INDEX "CopilotAction_userId_idx" ON "CopilotAction"("userId");

ALTER TABLE "CopilotAction" ADD CONSTRAINT "CopilotAction_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CopilotAction" ADD CONSTRAINT "CopilotAction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CopilotAction" ADD CONSTRAINT "CopilotAction_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
