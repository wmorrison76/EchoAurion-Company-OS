-- Error capture + blast-radius + taxonomy (ZARO lineage).

CREATE TYPE "ErrorBlastScope" AS ENUM ('USER', 'ACCOUNT', 'GLOBAL');
CREATE TYPE "ErrorCategory" AS ENUM ('UI', 'API', 'AUTH', 'DATA', 'INTEGRATION', 'INFRA', 'UNKNOWN');

ALTER TABLE "help_tickets"
  ADD COLUMN IF NOT EXISTS "errorScope" "ErrorBlastScope",
  ADD COLUMN IF NOT EXISTS "errorCategory" "ErrorCategory",
  ADD COLUMN IF NOT EXISTS "productLine" TEXT,
  ADD COLUMN IF NOT EXISTS "fingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "affectedClientKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "lastOccurredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "notifyWhenFixed" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "sessionHint" TEXT,
  ADD COLUMN IF NOT EXISTS "errorClass" TEXT,
  ADD COLUMN IF NOT EXISTS "moduleHint" TEXT,
  ADD COLUMN IF NOT EXISTS "needsHumanCoreReview" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "help_tickets_fingerprint_status_idx"
  ON "help_tickets"("fingerprint", "status");

CREATE INDEX IF NOT EXISTS "help_tickets_errorScope_status_idx"
  ON "help_tickets"("errorScope", "status");

CREATE INDEX IF NOT EXISTS "help_tickets_errorCategory_productLine_idx"
  ON "help_tickets"("errorCategory", "productLine");

CREATE TABLE IF NOT EXISTS "error_patterns" (
  "id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "errorCategory" "ErrorCategory" NOT NULL,
  "errorScope" "ErrorBlastScope" NOT NULL,
  "productLine" TEXT NOT NULL,
  "moduleHint" TEXT,
  "errorClass" TEXT,
  "sampleMessage" TEXT NOT NULL,
  "hitCount" INTEGER NOT NULL DEFAULT 1,
  "distinctClients" INTEGER NOT NULL DEFAULT 1,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastTicketId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "error_patterns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "error_patterns_fingerprint_productLine_key"
  ON "error_patterns"("fingerprint", "productLine");

CREATE INDEX IF NOT EXISTS "error_patterns_errorCategory_productLine_lastSeenAt_idx"
  ON "error_patterns"("errorCategory", "productLine", "lastSeenAt");

CREATE INDEX IF NOT EXISTS "error_patterns_errorScope_lastSeenAt_idx"
  ON "error_patterns"("errorScope", "lastSeenAt");

CREATE INDEX IF NOT EXISTS "error_patterns_hitCount_idx"
  ON "error_patterns"("hitCount");
