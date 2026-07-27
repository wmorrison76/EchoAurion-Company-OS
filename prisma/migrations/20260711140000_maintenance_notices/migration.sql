-- Scheduled maintenance / major-update notices for pilot blast

CREATE TABLE IF NOT EXISTS "maintenance_notices" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "windowStart" TIMESTAMP(3),
    "windowEnd" TIMESTAMP(3),
    "targetScope" TEXT NOT NULL DEFAULT 'ALL',
    "targetValue" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'william_morrison',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "maintenance_notices_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "maintenance_notices_status_scheduledFor_idx"
  ON "maintenance_notices"("status", "scheduledFor");

CREATE INDEX IF NOT EXISTS "maintenance_notices_createdAt_idx"
  ON "maintenance_notices"("createdAt");
